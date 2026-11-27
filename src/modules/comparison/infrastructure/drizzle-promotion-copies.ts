import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PromotionCopies, PromotionCopy } from '../application/promotion-copies';
import { promotions } from './schema';

export class DrizzlePromotionCopies implements PromotionCopies {
  constructor(private readonly db: NodePgDatabase) {}

  async findByPresentations(presentationIds: string[]): Promise<PromotionCopy[]> {
    if (presentationIds.length === 0) return [];
    return this.db
      .select()
      .from(promotions)
      .where(inArray(promotions.presentationId, presentationIds));
  }

  async findByEstablishment(establishmentId: string): Promise<PromotionCopy[]> {
    return this.db.select().from(promotions).where(eq(promotions.establishmentId, establishmentId));
  }
}
