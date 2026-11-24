import { asc, eq, isNull, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../../../shared/database/database.module';
import type { OfficialReview, OfficialReviewStore } from '../application/stores';
import { officialReviews } from './schema';

type Executor = NodePgDatabase | Transaction;

// ADR-037: los precios oficiales sin referencia que esperan a un moderador.
export class DrizzleOfficialReviewStore implements OfficialReviewStore {
  constructor(private readonly db: Executor) {}

  async save(review: OfficialReview): Promise<void> {
    await this.db.insert(officialReviews).values(review).onConflictDoNothing();
  }

  async pending(): Promise<OfficialReview[]> {
    const rows = await this.db
      .select()
      .from(officialReviews)
      .where(isNull(officialReviews.state))
      .orderBy(asc(officialReviews.receivedAt));
    return rows.map(({ state: _state, ...review }) => review);
  }

  async decide(reviewId: string, decision: 'aprobado' | 'descartado'): Promise<void> {
    await this.db
      .update(officialReviews)
      .set({ state: decision })
      .where(and(eq(officialReviews.reviewId, reviewId), isNull(officialReviews.state)));
  }

  async close(reviewId: string): Promise<void> {
    await this.db
      .update(officialReviews)
      .set({ state: 'cerrado' })
      .where(and(eq(officialReviews.reviewId, reviewId), isNull(officialReviews.state)));
  }
}
