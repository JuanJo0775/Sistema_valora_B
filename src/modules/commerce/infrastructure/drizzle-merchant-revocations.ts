import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { MerchantRevocation, MerchantRevocations } from '../application/merchant-cases';
import type { MerchantPurges } from '../application/purge-merchant-account';
import {
  merchantCases,
  merchantClaimRejections,
  merchantClaims,
  officialPrices,
  promotions,
} from './schema';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// Lo publicado por la tienda deja de mostrarse (D3).
async function withdrawPublished(tx: Transaction, establishmentId: string): Promise<void> {
  await tx.delete(officialPrices).where(eq(officialPrices.establishmentId, establishmentId));
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
      await withdrawPublished(tx, establishmentId);
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
      if (establishmentId !== null) await withdrawPublished(tx, establishmentId);
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }
}
