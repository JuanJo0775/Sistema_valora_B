import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import { MerchantCaseNotFoundError } from '../application/decide-merchant-case';
import type { MerchantClaimReview, MerchantClaimReviews } from '../application/merchant-cases';
import { merchantCases, merchantClaimRejections, merchantClaims } from './schema';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// H11 (ADR-038): la decisión del moderador sobre un reclamo pre-aprobado. Todo junto o nada (ADR-015).
// Cada escritura exige el estado esperado (la solicitud pre-aprobada de esa cuenta y tienda, el caso
// pendiente) y devuelve las filas que cambió: si alguna no cambia nada, otra decisión o una revocación
// se adelantó. Entonces se lanza MerchantCaseNotFoundError, la transacción se deshace y no se publica
// ningún evento.
export class DrizzleMerchantClaimReviews implements MerchantClaimReviews {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async approve(review: MerchantClaimReview, events: DomainEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // El caso primero: dos decisiones simultáneas se serializan en esta fila y la segunda ya no la ve
      // pendiente.
      await this.closeCase(tx, review, 'aprobado');
      const verified = await tx
        .update(merchantClaims)
        .set({ status: 'verificado', verifiedAt: review.decidedAt })
        .where(this.pendingClaim(review))
        .returning({ accountId: merchantClaims.accountId });
      if (verified.length === 0) throw new MerchantCaseNotFoundError();
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  async reject(review: MerchantClaimReview): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.closeCase(tx, review, 'rechazado');
      const removed = await tx
        .delete(merchantClaims)
        .where(this.pendingClaim(review))
        .returning({ accountId: merchantClaims.accountId });
      if (removed.length === 0) throw new MerchantCaseNotFoundError();
      await tx.insert(merchantClaimRejections).values({
        accountId: review.accountId,
        establishmentId: review.establishmentId,
        reason: review.note,
        rejectedAt: review.decidedAt,
        outcome: 'rechazado',
      });
    });
  }

  private pendingClaim(review: MerchantClaimReview) {
    return and(
      eq(merchantClaims.accountId, review.accountId),
      eq(merchantClaims.establishmentId, review.establishmentId),
      eq(merchantClaims.status, 'pre_aprobado'),
    );
  }

  private async closeCase(
    tx: Transaction,
    review: MerchantClaimReview,
    status: 'aprobado' | 'rechazado',
  ): Promise<void> {
    const closed = await tx
      .update(merchantCases)
      .set({
        status,
        note: review.note,
        moderatorKey: review.moderatorKey,
        decidedAt: review.decidedAt,
      })
      .where(and(eq(merchantCases.id, review.caseId), eq(merchantCases.status, 'pendiente')))
      .returning({ id: merchantCases.id });
    if (closed.length === 0) throw new MerchantCaseNotFoundError();
  }
}
