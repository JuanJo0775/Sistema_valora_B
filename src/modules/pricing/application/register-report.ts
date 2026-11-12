import { randomUUID } from 'node:crypto';
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

export class RegisterReport {
  constructor(private readonly deps: RegisterReportDependencies) {}

  async execute({ idempotencyKey, report }: RegisterReportCommand): Promise<RegisterReportResult> {
    const newReport = {
      ...report,
      id: randomUUID(),
      receivedAt: this.deps.clock.now(),
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
