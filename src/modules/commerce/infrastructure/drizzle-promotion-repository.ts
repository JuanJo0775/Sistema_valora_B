import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { Promotion, PromotionRepository } from '../application/promotions';
import { promotions } from './schema';

export class DrizzlePromotionRepository implements PromotionRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // ADR-015: la promoción y su evento se confirman juntos.
  async save(promotion: Promotion, events: DomainEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(promotions).values(promotion);
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  async listFor(establishmentId: string): Promise<Promotion[]> {
    return this.db
      .select()
      .from(promotions)
      .where(eq(promotions.establishmentId, establishmentId))
      .orderBy(desc(promotions.createdAt));
  }

  async findById(promotionId: string): Promise<Promotion | null> {
    const [found] = await this.db.select().from(promotions).where(eq(promotions.id, promotionId));
    return found ?? null;
  }

  async delete(promotionId: string, events: DomainEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(promotions).where(eq(promotions.id, promotionId));
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }
}
