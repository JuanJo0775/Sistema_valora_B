import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEvent, type DomainEvent, type OutboxPublisher } from '../../../shared/events';
import {
  OFFICIAL_PRICE_REVIEW_CLOSED,
  type OfficialPrice,
  type OfficialPriceRepository,
  type OfficialPriceReview,
} from '../application/official-prices';
import { officialPriceReviews, officialPrices } from './schema';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// ADR-037: las revisiones pendientes de esas presentaciones se cierran (publicó otro precio, o lo
// reemplazó otra revisión); moderación las saca de la cola con OfficialPriceReviewClosed.
export async function closeReviews(
  tx: Transaction,
  outbox: OutboxPublisher,
  establishmentId: string,
  presentationIds: string[],
): Promise<void> {
  if (presentationIds.length === 0) return;
  const closed = await tx
    .delete(officialPriceReviews)
    .where(
      and(
        eq(officialPriceReviews.establishmentId, establishmentId),
        inArray(officialPriceReviews.presentationId, presentationIds),
      ),
    )
    .returning({ reviewId: officialPriceReviews.reviewId });
  for (const { reviewId } of closed) {
    await outbox.publish(tx, createEvent(OFFICIAL_PRICE_REVIEW_CLOSED, 1, { reviewId }));
  }
}

export class DrizzleOfficialPriceRepository implements OfficialPriceRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // ADR-015: el precio y su evento se confirman juntos. Publicar otra vez lo reemplaza.
  save(price: OfficialPrice, events: DomainEvent[]): Promise<void> {
    return this.saveAll([price], events);
  }

  // D7: todas las filas del archivo en una sola transacción, con sus eventos. ADR-037: publicar una
  // presentación cierra su revisión pendiente; las filas sin referencia pasan a revisión.
  async saveAll(
    prices: OfficialPrice[],
    events: DomainEvent[],
    reviews: OfficialPriceReview[] = [],
  ): Promise<void> {
    if (prices.length === 0 && reviews.length === 0) return;
    await this.db.transaction(async (tx) => {
      if (prices.length > 0) {
        await tx
          .insert(officialPrices)
          .values(prices)
          .onConflictDoUpdate({
            target: [officialPrices.establishmentId, officialPrices.presentationId],
            set: {
              priceCop: sql`excluded.price_cop`,
              confirmedAt: sql`excluded.confirmed_at`,
            },
          });
        for (const [establishmentId, group] of groupByStore(prices)) {
          await closeReviews(tx, this.outbox, establishmentId, group);
        }
      }
      if (reviews.length > 0) {
        for (const [establishmentId, group] of groupByStore(reviews)) {
          await closeReviews(tx, this.outbox, establishmentId, group);
        }
        await tx.insert(officialPriceReviews).values(reviews);
      }
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  hold(review: OfficialPriceReview, events: DomainEvent[]): Promise<void> {
    return this.saveAll([], events, [review]);
  }

  async listReviewsFor(establishmentId: string): Promise<OfficialPriceReview[]> {
    return this.db
      .select()
      .from(officialPriceReviews)
      .where(eq(officialPriceReviews.establishmentId, establishmentId))
      .orderBy(asc(officialPriceReviews.submittedAt), asc(officialPriceReviews.presentationId));
  }

  async takeReview(
    establishmentId: string,
    presentationId: string,
    reviewId: string,
  ): Promise<OfficialPriceReview | null> {
    const [taken] = await this.db
      .delete(officialPriceReviews)
      .where(
        and(
          eq(officialPriceReviews.establishmentId, establishmentId),
          eq(officialPriceReviews.presentationId, presentationId),
          eq(officialPriceReviews.reviewId, reviewId),
        ),
      )
      .returning();
    return taken ?? null;
  }

  async findOne(establishmentId: string, presentationId: string): Promise<OfficialPrice | null> {
    const [found] = await this.db
      .select({
        establishmentId: officialPrices.establishmentId,
        presentationId: officialPrices.presentationId,
        priceCop: officialPrices.priceCop,
        confirmedAt: officialPrices.confirmedAt,
      })
      .from(officialPrices)
      .where(
        and(
          eq(officialPrices.establishmentId, establishmentId),
          eq(officialPrices.presentationId, presentationId),
        ),
      );
    return found ?? null;
  }

  async listFor(establishmentId: string): Promise<OfficialPrice[]> {
    return this.db
      .select({
        establishmentId: officialPrices.establishmentId,
        presentationId: officialPrices.presentationId,
        priceCop: officialPrices.priceCop,
        confirmedAt: officialPrices.confirmedAt,
      })
      .from(officialPrices)
      .where(eq(officialPrices.establishmentId, establishmentId))
      .orderBy(asc(officialPrices.publishedAt), asc(officialPrices.presentationId));
  }

  async reconfirmAll(establishmentId: string, at: Date, events: DomainEvent[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(officialPrices)
        .set({ confirmedAt: at })
        .where(eq(officialPrices.establishmentId, establishmentId))
        .returning({ presentationId: officialPrices.presentationId });
      for (const event of events) await this.outbox.publish(tx, event);
      return updated.length;
    });
  }
}

// Las presentaciones de cada tienda (un archivo es de una sola tienda, pero el puerto no lo exige).
function groupByStore(
  items: { establishmentId: string; presentationId: string }[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const { establishmentId, presentationId } of items) {
    groups.set(establishmentId, [...(groups.get(establishmentId) ?? []), presentationId]);
  }
  return groups;
}
