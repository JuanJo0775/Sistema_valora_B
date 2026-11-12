import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { priceCurrent } from './schema';

// Datos de PriceReported versión 1 (contrato del evento en la issue #14).
interface PriceReportedV1 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  priceType: string;
  observedAt: string;
  receivedAt: string;
}

// Suscriptor de PriceReported: deja el reporte en price_current (ADR-004).
export async function onPriceReported(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as PriceReportedV1;
  await tx.insert(priceCurrent).values({
    presentationId: payload.presentationId,
    establishmentId: payload.establishmentId,
    reportId: payload.reportId,
    priceCop: payload.priceCop,
    priceType: payload.priceType,
    observedAt: new Date(payload.observedAt),
    receivedAt: new Date(payload.receivedAt),
  });
}
