import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import { assertObservedAtAccepted } from '../../../domain/observation-date';
import { burstAt, nextAllowedObservation, REPORT_LIMITS } from '../../../domain/report-limits';
import { createEvent } from '../../../shared/events';
import type { NewReport, ReportInput, ReportRepository } from './report-repository';

// Puertos hacia catalog, establishments y el reloj: el caso de uso no conoce sus implementaciones.
export interface ExistenceCheck {
  exists(id: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

// Puerto hacia identity: la clave seudónima del reportante (grill de la #31, pregunta 2).
export interface ReporterPseudonyms {
  of(accountId: string): Promise<{ reporterKey: string; reporterSince: string }>;
}

export interface RegisterReportDependencies {
  reports: ReportRepository;
  presentations: ExistenceCheck;
  establishments: ExistenceCheck;
  reporters: ReporterPseudonyms;
  clock: Clock;
}

export interface RegisterReportCommand {
  idempotencyKey: string;
  report: ReportInput;
}

export interface ReportReceipt {
  id: string;
  status: 'recibido';
  receivedAt: Date;
}

export interface RegisterReportResult {
  receipt: ReportReceipt;
  // false cuando es un reintento con la misma clave (la ruta responde 200 en lugar de 201).
  created: boolean;
}

export const PRICE_REPORTED = 'PriceReported';

// Grill de la #14, pregunta 5: reglas incumplidas (422) con código estable.
export class UnknownPresentationError extends DomainError {
  readonly code = 'UNKNOWN_PRESENTATION';
}

export class UnknownEstablishmentError extends DomainError {
  readonly code = 'UNKNOWN_ESTABLISHMENT';
}

// Grill de la #14, pregunta 3: la misma clave con otro reporte es un conflicto (409).
export class IdempotencyKeyReusedError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
}

const HOUR_MS = 60 * 60 * 1000;
export const REPORT_BURST_DETECTED = 'ReportBurstDetected';

// El mensaje dice la hora como la ve quien reporta en el Quindío.
const COLOMBIA_TIME = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});

// Grill de la #29, pregunta 2: la capa HTTP lo traduce a 409. Issue #84: dice desde qué hora de
// observación se acepta un reporte nuevo (reintentar el mismo nunca pasa: su hora no cambia).
export class DuplicateReportError extends Error {
  readonly code = 'DUPLICATE_REPORT';

  constructor(readonly availableFrom: Date) {
    super(
      `Ya reportaste esta presentación en esta tienda. Puedes reportarla de nuevo con una observación desde las ${COLOMBIA_TIME.format(availableFrom)}.`,
    );
    this.name = 'DuplicateReportError';
  }
}

// RF-012 RN2 (grill de la #29, pregunta 3): bloqueo temporal; la capa HTTP responde 429.
export class TooManyReportsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Demasiados reportes en la última hora.');
    this.name = 'TooManyReportsError';
  }
}

// Huella del reporte (grill de la #14, pregunta 6): distingue un reintento de un reporte distinto.
function hashOf(report: ReportInput): string {
  // Con la cuenta: la misma clave usada por otra cuenta es un conflicto, no un reintento.
  const fields = [
    report.reporterId,
    report.presentationId,
    report.establishmentId,
    report.priceCop,
    report.priceType,
    report.observedAt.toISOString(),
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

// EC-07: un reintento de la cola sin conexión recibe la respuesta original.
function retryResult(stored: NewReport, requestHash: string): RegisterReportResult {
  if (stored.requestHash !== requestHash) {
    throw new IdempotencyKeyReusedError('La clave Idempotency-Key ya se usó con otro reporte.');
  }
  return {
    receipt: { id: stored.id, status: 'recibido', receivedAt: stored.receivedAt },
    created: false,
  };
}

export class RegisterReport {
  constructor(private readonly deps: RegisterReportDependencies) {}

  async execute({ idempotencyKey, report }: RegisterReportCommand): Promise<RegisterReportResult> {
    const requestHash = hashOf(report);
    const existing = await this.deps.reports.findByIdempotencyKey(idempotencyKey);
    if (existing) return retryResult(existing, requestHash);
    const receivedAt = this.deps.clock.now();
    assertObservedAtAccepted({ observedAt: report.observedAt, receivedAt });
    if (!(await this.deps.presentations.exists(report.presentationId))) {
      throw new UnknownPresentationError('La presentación no existe en el catálogo.');
    }
    if (!(await this.deps.establishments.exists(report.establishmentId))) {
      throw new UnknownEstablishmentError('El establecimiento no existe en el directorio.');
    }
    let burstWindow: string[] | null;
    try {
      burstWindow = await this.checkLimits(report);
    } catch (error) {
      // Grill de la #30: un envío simultáneo con la misma clave pudo guardarse entre la búsqueda de
      // arriba y los límites; entonces es un reintento, no un duplicado ni una ráfaga (EC-07).
      const stored = await this.deps.reports.findByIdempotencyKey(idempotencyKey);
      if (stored) return retryResult(stored, requestHash);
      throw error;
    }
    const newReport = {
      ...report,
      id: randomUUID(),
      receivedAt,
      idempotencyKey,
      requestHash,
    };
    const { reporterKey, reporterSince } = await this.deps.reporters.of(report.reporterId);
    const saved = await this.deps.reports.save(
      newReport,
      // Versión 2 (#31): la clave seudónima y el día de la cuenta; nunca el id ni el correo (EC-08).
      [
        createEvent(PRICE_REPORTED, 2, {
          reportId: newReport.id,
          presentationId: report.presentationId,
          establishmentId: report.establishmentId,
          priceCop: report.priceCop,
          priceType: report.priceType,
          observedAt: report.observedAt.toISOString(),
          receivedAt: newReport.receivedAt.toISOString(),
          reporterKey,
          reporterSince,
        }),
        // RF-012 RN2: el reporte que deja la cuenta en el límite avisa a moderación, solo con la
        // clave seudónima (EC-08).
        ...(burstWindow
          ? [
              createEvent(REPORT_BURST_DETECTED, 1, {
                reporterKey,
                reportIds: [...burstWindow, newReport.id],
              }),
            ]
          : []),
      ],
    );
    // Dos reintentos simultáneos: el que no insertó responde como reintento.
    if (!saved.created) return retryResult(saved.report, requestHash);
    return { receipt: { id: newReport.id, status: 'recibido', receivedAt }, created: true };
  }

  // Grill de la #29: los límites de aportes de una cuenta, contados en la base. Grill de la #30,
  // pregunta 2: por la hora de observación, para que la cola sin conexión no choque al reconectar.
  // Devuelve los otros reportes de esa hora si este completa una ráfaga, para avisar a moderación.
  private async checkLimits(report: ReportInput): Promise<string[] | null> {
    const observed = report.observedAt.getTime();
    const margin = Math.max(REPORT_LIMITS.duplicateWindowMinutes * 60 * 1000, HOUR_MS);
    const around = await this.deps.reports.observedBetween(
      report.reporterId,
      new Date(observed - margin),
      new Date(observed + margin),
    );
    const duplicateWindowMs = REPORT_LIMITS.duplicateWindowMinutes * 60 * 1000;
    const samePair = around.filter(
      (seen) =>
        seen.presentationId === report.presentationId &&
        seen.establishmentId === report.establishmentId,
    );
    const duplicate = samePair.some(
      (seen) => Math.abs(seen.observedAt.getTime() - observed) < duplicateWindowMs,
    );
    if (duplicate) {
      throw new DuplicateReportError(
        nextAllowedObservation(
          samePair.map((seen) => seen.observedAt),
          report.observedAt,
        ),
      );
    }
    const burst = burstAt(around, report.observedAt);
    if (burst.exceeded) throw new TooManyReportsError(burst.waitSeconds ?? 1);
    return burst.completes ? burst.window : null;
  }
}
