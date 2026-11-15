import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import { assertObservedAtAccepted } from '../../../domain/observation-date';
import { burstWaitSeconds, REPORT_LIMITS } from '../../../domain/report-limits';
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

// Grill de la #29, pregunta 2: la capa HTTP lo traduce a 409.
export class DuplicateReportError extends Error {
  readonly code = 'DUPLICATE_REPORT';

  constructor() {
    super(
      `Ya reportaste esta presentación en esta tienda en los últimos ${String(REPORT_LIMITS.duplicateWindowMinutes)} minutos.`,
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
    await this.checkLimits(report, receivedAt);
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
      ],
    );
    // Dos reintentos simultáneos: el que no insertó responde como reintento.
    if (!saved.created) return retryResult(saved.report, requestHash);
    return { receipt: { id: newReport.id, status: 'recibido', receivedAt }, created: true };
  }

  // Grill de la #29: los límites de aportes de una cuenta, contados en la base.
  private async checkLimits(report: ReportInput, receivedAt: Date): Promise<void> {
    const duplicateWindowMs = REPORT_LIMITS.duplicateWindowMinutes * 60 * 1000;
    // La ventana más larga de las dos: la del duplicado o la hora de la ráfaga.
    const since = new Date(receivedAt.getTime() - Math.max(duplicateWindowMs, HOUR_MS));
    const recent = await this.deps.reports.recentOf(report.reporterId, since);
    const duplicateSince = receivedAt.getTime() - duplicateWindowMs;
    const duplicate = recent.some(
      (seen) =>
        seen.receivedAt.getTime() > duplicateSince &&
        seen.presentationId === report.presentationId &&
        seen.establishmentId === report.establishmentId,
    );
    if (duplicate) throw new DuplicateReportError();
    const wait = burstWaitSeconds(
      recent.map((seen) => seen.receivedAt),
      receivedAt,
    );
    if (wait !== null) throw new TooManyReportsError(wait);
  }
}
