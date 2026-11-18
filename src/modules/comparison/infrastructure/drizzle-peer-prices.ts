import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PeerPrice, PeerPriceStore } from '../application/peer-prices';
import { priceCurrent } from './schema';

export class DrizzlePeerPrices implements PeerPriceStore {
  constructor(private readonly db: NodePgDatabase) {}

  vigentesOf(presentationId: string, priceType: 'normal' | 'oferta'): Promise<PeerPrice[]> {
    return this.db
      .select({ establishmentId: priceCurrent.establishmentId, priceCop: priceCurrent.priceCop })
      .from(priceCurrent)
      .where(
        and(
          eq(priceCurrent.presentationId, presentationId),
          eq(priceCurrent.priceType, priceType),
          eq(priceCurrent.status, 'vigente'),
        ),
      );
  }
}
