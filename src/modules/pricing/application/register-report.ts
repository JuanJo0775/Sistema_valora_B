import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import { assertObservedAtAccepted } from '../../../domain/observation-date';
import { createEvent } from '../../../shared/events';
import type { ReportInput, ReportRepository } from './report-repository';

// Puertos hacia catalog, establishments y el reloj: el caso de uso no conoce sus implementaciones.
export interface ExistenceCheck {
  exists(id: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface RegisterReportDependencies {
  reports: ReportRepository;
  presentations: ExistenceCheck;
  establishments: ExistenceCheck;
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

export class RegisterReport {
  constructor(private readonly deps: RegisterReportDependencies) {}

  async execute({ idempotencyKey, report }: RegisterReportCommand): Promise<RegisterReportResult> {
    // EC-07: un reintento de la cola sin conexión recibe la respuesta original.
    const existing = await this.deps.reports.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        receipt: { id: existing.id, status: 'recibido', receivedAt: existing.receivedAt },
        created: false,
      };
    }
    const receivedAt = this.deps.clock.now();
    assertObservedAtAccepted({ observedAt: report.observedAt, receivedAt });
    if (!(await this.deps.presentations.exists(report.presentationId))) {
      throw new UnknownPresentationError('La presentación no existe en el catálogo.');
    }
    if (!(await this.deps.establishments.exists(report.establishmentId))) {
      throw new UnknownEstablishmentError('El establecimiento no existe en el directorio.');
    }
    const newReport = {
      ...report,
      id: randomUUID(),
      receivedAt,
      idempotencyKey,
    };
    const saved = await this.deps.reports.save(
      newReport,
      createEvent(PRICE_REPORTED, 1, {
        reportId: newReport.id,
        presentationId: report.presentationId,
        establishmentId: report.establishmentId,
        priceCop: report.priceCop,
        priceType: report.priceType,
        observedAt: report.observedAt.toISOString(),
        receivedAt: newReport.receivedAt.toISOString(),
      }),
    );
    return {
      receipt: { id: saved.report.id, status: 'recibido', receivedAt: saved.report.receivedAt },
      created: saved.created,
    };
  }
}
