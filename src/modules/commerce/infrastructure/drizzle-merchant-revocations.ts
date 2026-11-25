import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEvent, type DomainEvent, type OutboxPublisher } from '../../../shared/events';
import { OFFICIAL_PRICE_REVIEW_CLOSED } from '../application/official-prices';
import type { MerchantRevocation, MerchantRevocations } from '../application/merchant-cases';
import type { MerchantPurges } from '../application/purge-merchant-account';
import {
  disputeChallengers,
  merchantCases,
  merchantClaimRejections,
  merchantClaims,
  merchantNotices,
  officialPriceReviews,
  officialPrices,
  promotions,
} from './schema';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// Lo publicado por la tienda deja de mostrarse (D3). ADR-037: sus precios en revisión se cierran y
// moderación los saca de la cola.
async function withdrawPublished(
  tx: Transaction,
  outbox: OutboxPublisher,
  establishmentId: string,
): Promise<void> {
  await tx.delete(officialPrices).where(eq(officialPrices.establishmentId, establishmentId));
  const closed = await tx
    .delete(officialPriceReviews)
    .where(eq(officialPriceReviews.establishmentId, establishmentId))
    .returning({ reviewId: officialPriceReviews.reviewId });
  for (const { reviewId } of closed) {
    await outbox.publish(tx, createEvent(OFFICIAL_PRICE_REVIEW_CLOSED, 1, { reviewId }));
  }
  await tx.delete(promotions).where(eq(promotions.establishmentId, establishmentId));
}

export class DrizzleMerchantRevocations implements MerchantRevocations, MerchantPurges {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // D3: todo junto o nada (ADR-015).
  async revoke(revocation: MerchantRevocation, events: DomainEvent[]): Promise<void> {
    const { accountId, establishmentId, reason, moderatorKey, revokedAt } = revocation;
    await this.db.transaction(async (tx) => {
      await tx.delete(merchantClaims).where(eq(merchantClaims.accountId, accountId));
      await tx.insert(merchantClaimRejections).values({
        accountId,
        establishmentId,
        reason,
        rejectedAt: revokedAt,
        outcome: 'revocado',
      });
      await withdrawPublished(tx, this.outbox, establishmentId);
      // Los casos abiertos de esa tienda se cierran con la revocación, con su bitácora.
      await tx
        .update(merchantCases)
        .set({ status: 'revocado', note: reason, moderatorKey, decidedAt: revokedAt })
        .where(
          and(
            eq(merchantCases.establishmentId, establishmentId),
            eq(merchantCases.status, 'pendiente'),
          ),
        );
      await tx
        .delete(disputeChallengers)
        .where(eq(disputeChallengers.establishmentId, establishmentId));
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  // ADR-032 (#208): no queda nada de la cuenta en commerce.
  async purge(
    accountId: string,
    establishmentId: string | null,
    events: DomainEvent[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(merchantClaims).where(eq(merchantClaims.accountId, accountId));
      await tx
        .delete(merchantClaimRejections)
        .where(eq(merchantClaimRejections.accountId, accountId));
      await tx.delete(merchantNotices).where(eq(merchantNotices.accountId, accountId));
      // H18: sus datos como solicitante de una disputa; el caso queda, solo con la clave seudónima.
      await tx.delete(disputeChallengers).where(eq(disputeChallengers.accountId, accountId));
      if (establishmentId !== null) await withdrawPublished(tx, this.outbox, establishmentId);
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }
}
