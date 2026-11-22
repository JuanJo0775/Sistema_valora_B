import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import {
  AccountHasEstablishmentError,
  EstablishmentHasOwnerError,
} from '../application/claim-establishment';
import type {
  MerchantClaim,
  MerchantClaimRejection,
  MerchantClaimRepository,
  ProposedClaimResolutions,
} from '../application/merchant-claims';
import { merchantClaimRejections, merchantClaims } from './schema';

const UNIQUE_VIOLATION = '23505';

// La restricción CHECK de la tabla garantiza el estado.
const toClaim = (row: typeof merchantClaims.$inferSelect): MerchantClaim => ({
  ...row,
  status: row.status as MerchantClaim['status'],
});

// Dos registros simultáneos pasan las comprobaciones del caso de uso; la base deja uno solo (D3).
function ownershipConflict(error: unknown): Error | null {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const { code, constraint } = cause as { code?: string; constraint?: string };
  if (code !== UNIQUE_VIOLATION) return null;
  return constraint === 'merchant_claims_establishment_idx'
    ? new EstablishmentHasOwnerError()
    : new AccountHasEstablishmentError();
}

export class DrizzleMerchantClaimRepository
  implements MerchantClaimRepository, ProposedClaimResolutions
{
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  // ADR-015: la solicitud y sus eventos se confirman juntos o no se guarda ninguno.
  async save(claim: MerchantClaim, events: DomainEvent[]): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(merchantClaims).values(claim);
        for (const event of events) await this.outbox.publish(tx, event);
      });
    } catch (error) {
      throw ownershipConflict(error) ?? error;
    }
  }

  async findByAccount(accountId: string): Promise<MerchantClaim | null> {
    const [row] = await this.db
      .select()
      .from(merchantClaims)
      .where(eq(merchantClaims.accountId, accountId));
    return row ? toClaim(row) : null;
  }

  async pendingFor(establishmentId: string): Promise<MerchantClaim | null> {
    const [row] = await this.db
      .select()
      .from(merchantClaims)
      .where(
        and(
          eq(merchantClaims.establishmentId, establishmentId),
          eq(merchantClaims.status, 'pre_aprobado'),
        ),
      );
    return row ? toClaim(row) : null;
  }

  // ADR-015: la verificación y MerchantVerified se confirman juntos.
  async verify(
    accountId: string,
    establishmentId: string,
    verifiedAt: Date,
    events: DomainEvent[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(merchantClaims)
        .set({ establishmentId, status: 'verificado', verifiedAt })
        .where(eq(merchantClaims.accountId, accountId));
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  // La solicitud sale de las activas y queda en el historial, juntos.
  async reject(rejection: MerchantClaimRejection): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(merchantClaims).where(eq(merchantClaims.accountId, rejection.accountId));
      await tx.insert(merchantClaimRejections).values(rejection);
    });
  }

  async ownerOf(establishmentId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ accountId: merchantClaims.accountId })
      .from(merchantClaims)
      .where(eq(merchantClaims.establishmentId, establishmentId));
    return row?.accountId ?? null;
  }

  async establishmentOf(accountId: string): Promise<string | null> {
    return (await this.findByAccount(accountId))?.establishmentId ?? null;
  }

  async wasRevokedFrom(accountId: string, establishmentId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: merchantClaimRejections.id })
      .from(merchantClaimRejections)
      .where(
        and(
          eq(merchantClaimRejections.accountId, accountId),
          eq(merchantClaimRejections.establishmentId, establishmentId),
          eq(merchantClaimRejections.outcome, 'revocado'),
        ),
      );
    return found !== undefined;
  }

  async lastRejection(accountId: string): Promise<MerchantClaimRejection | null> {
    const [row] = await this.db
      .select({
        accountId: merchantClaimRejections.accountId,
        establishmentId: merchantClaimRejections.establishmentId,
        reason: merchantClaimRejections.reason,
        rejectedAt: merchantClaimRejections.rejectedAt,
      })
      .from(merchantClaimRejections)
      .where(eq(merchantClaimRejections.accountId, accountId))
      .orderBy(desc(merchantClaimRejections.rejectedAt))
      .limit(1);
    return row ?? null;
  }
}
