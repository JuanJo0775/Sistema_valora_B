import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { HistoryPrice } from '../../../domain/price-history';
import type { PriceHistoryRepository } from '../application/price-history-repository';
import { priceHistory } from './schema';

export class DrizzlePriceHistory implements PriceHistoryRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async countedSince(
    presentationIds: string[],
    since: Date,
    establishmentId?: string,
  ): Promise<HistoryPrice[]> {
    if (presentationIds.length === 0) return [];
    return this.db
      .select({
        presentationId: priceHistory.presentationId,
        priceCop: priceHistory.priceCop,
        observedAt: priceHistory.observedAt,
      })
      .from(priceHistory)
      .where(
        and(
          inArray(priceHistory.presentationId, presentationIds),
          gte(priceHistory.observedAt, since),
          eq(priceHistory.status, 'cuenta'),
          establishmentId === undefined
            ? undefined
            : eq(priceHistory.establishmentId, establishmentId),
        ),
      )
      .orderBy(asc(priceHistory.observedAt));
  }
}
