import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { priceCurrent } from './schema';

// Datos de PriceWithdrawn versión 1 (contrato de la #32): reliability descartó un reporte y propone
// el precio confiable más reciente de la tienda, o ninguno.
interface PriceWithdrawnV1 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  replacement: {
    reportId: string;
    priceCop: number;
    priceType: string;
    observedAt: string;
    receivedAt: string;
  } | null;
}

// Solo actúa si el precio que se muestra es el retirado: si ya llegó otro, ese sigue.
export async function onPriceWithdrawn(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as PriceWithdrawnV1;
  const shown = and(
    eq(priceCurrent.presentationId, payload.presentationId),
    eq(priceCurrent.establishmentId, payload.establishmentId),
    eq(priceCurrent.reportId, payload.reportId),
  );
  const { replacement } = payload;
  if (!replacement) {
    await tx.delete(priceCurrent).where(shown);
    return;
  }
  await tx
    .update(priceCurrent)
    .set({
      reportId: replacement.reportId,
      priceCop: replacement.priceCop,
      priceType: replacement.priceType,
      observedAt: new Date(replacement.observedAt),
      receivedAt: new Date(replacement.receivedAt),
      status: 'vigente',
    })
    .where(shown);
}
