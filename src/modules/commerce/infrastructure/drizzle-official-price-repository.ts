import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { OfficialPrice, OfficialPriceRepository } from '../application/official-prices';
import { officialPrices } from './schema';

export class DrizzleOfficialPriceRepository implements OfficialPriceRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // ADR-015: el precio y su evento se confirman juntos. Publicar otra vez lo reemplaza.
  save(price: OfficialPrice, events: DomainEvent[]): Promise<void> {
    return this.saveAll([price], events);
  }

  // D7: todas las filas del archivo en una sola transacción, con sus eventos.
  async saveAll(prices: OfficialPrice[], events: DomainEvent[]): Promise<void> {
    if (prices.length === 0) return;
    await this.db.transaction(async (tx) => {
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
      for (const event of events) await this.outbox.publish(tx, event);
    });
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
