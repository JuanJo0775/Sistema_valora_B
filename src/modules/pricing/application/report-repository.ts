import type { DomainEvent } from '../../../shared/events';

// Grill de la #14, pregunta 8: combo queda fuera hasta definir qué significa.
export type PriceType = 'normal' | 'oferta';

// Lo que el reportante observó en la tienda.
export interface ReportInput {
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  priceType: PriceType;
  observedAt: Date;
}

export interface NewReport extends ReportInput {
  id: string;
  receivedAt: Date;
  idempotencyKey: string;
}

export interface SavedReport {
  report: NewReport;
  created: boolean;
}

// Puerto del repositorio: solo los métodos que el caso de uso usa hoy.
export interface ReportRepository {
  findByIdempotencyKey(key: string): Promise<NewReport | null>;
  // Guarda el reporte y su evento en la misma transacción (ADR-015).
  save(report: NewReport, event: DomainEvent): Promise<SavedReport>;
}

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
