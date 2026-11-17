import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PriceSource } from '../../../domain/initial-price';
import type { InitialPriceStore, NewInitialPrice } from '../application/import-initial-prices';
import { priceCurrent } from './schema';

const samePlace = (presentationId: string, establishmentId: string) =>
  and(
    eq(priceCurrent.presentationId, presentationId),
    eq(priceCurrent.establishmentId, establishmentId),
  );

// B#135: los datos iniciales en price_current, con la fuente «siembra».
export class DrizzleInitialPrices implements InitialPriceStore {
  constructor(private readonly db: NodePgDatabase) {}

  async sourceAt(
    presentationId: string,
    establishmentId: string,
  ): Promise<PriceSource | undefined> {
    const [row] = await this.db
      .select({ source: priceCurrent.source })
      .from(priceCurrent)
      .where(samePlace(presentationId, establishmentId));
    // La restricción CHECK de la tabla garantiza que es una de las dos fuentes.
    return row?.source as PriceSource | undefined;
  }

  async put(price: NewInitialPrice): Promise<void> {
    const values = {
      presentationId: price.presentationId,
      establishmentId: price.establishmentId,
      reportId: price.id,
      priceCop: price.priceCop,
      priceType: 'normal',
      observedAt: price.observedAt,
      receivedAt: price.observedAt,
      status: 'vigente',
      source: 'siembra',
    };
    await this.db
      .insert(priceCurrent)
      .values(values)
      .onConflictDoUpdate({
        target: [priceCurrent.presentationId, priceCurrent.establishmentId],
        set: values,
        // Nunca sobre un precio de la comunidad, aunque llegue uno entre la lectura y la escritura.
        setWhere: eq(priceCurrent.source, 'siembra'),
      });
  }
}
