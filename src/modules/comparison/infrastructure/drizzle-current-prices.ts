import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CurrentPrice, CurrentPrices } from '../application/current-prices';
import { priceCurrent } from './schema';

export class DrizzleCurrentPrices implements CurrentPrices {
  constructor(private readonly db: NodePgDatabase) {}

  async findByPresentations(presentationIds: string[]): Promise<CurrentPrice[]> {
    if (presentationIds.length === 0) return [];
    return this.db
      .select({
        presentationId: priceCurrent.presentationId,
        establishmentId: priceCurrent.establishmentId,
        priceCop: priceCurrent.priceCop,
        observedAt: priceCurrent.observedAt,
      })
      .from(priceCurrent)
      .where(inArray(priceCurrent.presentationId, presentationIds));
  }
}
