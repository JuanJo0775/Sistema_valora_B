import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  AccountHasEstablishmentError,
  EstablishmentHasOwnerError,
} from '../application/claim-establishment';
import type { MerchantClaim, MerchantClaimRepository } from '../application/merchant-claims';
import { merchantClaims } from './schema';

const UNIQUE_VIOLATION = '23505';

// Dos registros simultáneos pasan las comprobaciones del caso de uso; la base deja uno solo (D3).
function ownershipConflict(error: unknown): Error | null {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const { code, constraint } = cause as { code?: string; constraint?: string };
  if (code !== UNIQUE_VIOLATION) return null;
  return constraint === 'merchant_claims_establishment_idx'
    ? new EstablishmentHasOwnerError()
    : new AccountHasEstablishmentError();
}

export class DrizzleMerchantClaimRepository implements MerchantClaimRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(claim: MerchantClaim): Promise<void> {
    try {
      await this.db.insert(merchantClaims).values(claim);
    } catch (error) {
      throw ownershipConflict(error) ?? error;
    }
  }

  async findByAccount(accountId: string): Promise<MerchantClaim | null> {
    const [row] = await this.db
      .select()
      .from(merchantClaims)
      .where(eq(merchantClaims.accountId, accountId));
    // La restricción CHECK de la tabla garantiza el estado.
    return row ? { ...row, status: row.status as MerchantClaim['status'] } : null;
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
}
