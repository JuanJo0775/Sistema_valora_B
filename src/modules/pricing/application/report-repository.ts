import type { DomainEvent } from '../../../shared/events';

// Grill de la #14, pregunta 8: combo queda fuera hasta definir qué significa.
export type PriceType = 'normal' | 'oferta';

// Lo que el reportante observó en la tienda, y quién lo reporta.
export interface ReportInput {
  // Cuenta de la sesión (#62). Nunca sale en respuestas ni eventos (EC-08).
  reporterId: string;
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
  requestHash: string;
}

export interface SavedReport {
  report: NewReport;
  created: boolean;
}

// Grill de la #29: lo que hace falta de los reportes recientes de una cuenta para los límites.
export interface RecentReport {
  id: string;
  presentationId: string;
  establishmentId: string;
  receivedAt: Date;
}

// Puerto del repositorio: solo los métodos que el caso de uso usa hoy.
export interface ReportRepository {
  findByIdempotencyKey(key: string): Promise<NewReport | null>;
  // Guarda el reporte y sus eventos en la misma transacción (ADR-015).
  save(report: NewReport, events: DomainEvent[]): Promise<SavedReport>;
  // Los reportes de una cuenta que llegaron después de `since`, del más viejo al más nuevo.
  recentOf(reporterId: string, since: Date): Promise<RecentReport[]>;
}

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
