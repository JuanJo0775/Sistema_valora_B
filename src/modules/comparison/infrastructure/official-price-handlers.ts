import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../shared/database/database.module';
import type { DomainEvent } from '../../../shared/events';
import { officialPrices } from './schema';

// Datos de OfficialPricePublished versión 1 (commerce, #203).
interface OfficialPricePublishedV1 {
  establishmentId: string;
  presentationId: string;
  priceCop: number;
  confirmedAt: string;
}

// Datos de OfficialPricesReconfirmed versión 1 (commerce, #203).
interface OfficialPricesReconfirmedV1 {
  establishmentId: string;
  confirmedAt: string;
}

// D1 y D4: publicar deja el oficial confirmado; la fecha del cambio solo se mueve si cambió el
// precio (reconfirmar no borra una discrepancia).
export async function onOfficialPricePublished(event: DomainEvent, tx: Transaction): Promise<void> {
  const payload = event.payload as unknown as OfficialPricePublishedV1;
  const confirmedAt = new Date(payload.confirmedAt);
  await tx
    .insert(officialPrices)
    .values({
      presentationId: payload.presentationId,
      establishmentId: payload.establishmentId,
      priceCop: payload.priceCop,
      confirmedAt,
      priceChangedAt: confirmedAt,
    })
    .onConflictDoUpdate({
      target: [officialPrices.presentationId, officialPrices.establishmentId],
      set: {
        confirmedAt,
        priceChangedAt: sql`case when ${officialPrices.priceCop} = excluded.price_cop then ${officialPrices.priceChangedAt} else excluded.price_changed_at end`,
        priceCop: sql`excluded.price_cop`,
      },
    });
}

// D4: «Todos mis precios siguen igual» reconfirma todos los oficiales de la tienda.
export async function onOfficialPricesReconfirmed(
  event: DomainEvent,
  tx: Transaction,
): Promise<void> {
  const payload = event.payload as unknown as OfficialPricesReconfirmedV1;
  await tx
    .update(officialPrices)
    .set({ confirmedAt: new Date(payload.confirmedAt) })
    .where(and(eq(officialPrices.establishmentId, payload.establishmentId)));
}
