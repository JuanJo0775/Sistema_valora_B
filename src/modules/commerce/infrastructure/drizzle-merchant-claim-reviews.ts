import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { MerchantClaimReview, MerchantClaimReviews } from '../application/merchant-cases';
import { merchantCases, merchantClaimRejections, merchantClaims } from './schema';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// H11 (ADR-037): la decisión del moderador sobre un reclamo pre-aprobado. Todo junto o nada (ADR-015).
export class DrizzleMerchantClaimReviews implements MerchantClaimReviews {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async approve(review: MerchantClaimReview, events: DomainEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(merchantClaims)
        .set({ status: 'verificado', verifiedAt: review.decidedAt })
        .where(eq(merchantClaims.accountId, review.accountId));
      await this.closeCase(tx, review, 'aprobado');
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  async reject(review: MerchantClaimReview): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(merchantClaims).where(eq(merchantClaims.accountId, review.accountId));
      await tx.insert(merchantClaimRejections).values({
        accountId: review.accountId,
        establishmentId: review.establishmentId,
        reason: review.note,
        rejectedAt: review.decidedAt,
        outcome: 'rechazado',
      });
      await this.closeCase(tx, review, 'rechazado');
    });
  }

  private async closeCase(
    tx: Transaction,
    review: MerchantClaimReview,
    status: 'aprobado' | 'rechazado',
  ): Promise<void> {
    await tx
      .update(merchantCases)
      .set({
        status,
        note: review.note,
        moderatorKey: review.moderatorKey,
        decidedAt: review.decidedAt,
      })
      .where(and(eq(merchantCases.id, review.caseId), eq(merchantCases.status, 'pendiente')));
  }
}
