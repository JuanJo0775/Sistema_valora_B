import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EmailVerificationRepository,
  NewEmailVerification,
  VerificationTarget,
} from '../application/email-verification-repository';
import { accounts, emailVerifications } from './schema';

export class DrizzleEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async replaceUnused(accountId: string, verification: NewEmailVerification): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Candado de la cuenta hasta el final de la transacción: dos reenvíos a la vez se turnan y el
      // índice único parcial nunca se viola. Es un candado de aplicación, no de filas ni de tablas.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}, 0))`);
      await tx
        .delete(emailVerifications)
        .where(and(eq(emailVerifications.accountId, accountId), isNull(emailVerifications.usedAt)));
      await tx.insert(emailVerifications).values(verification);
    });
  }

  // Un solo UPDATE atómico gasta el token: solo uno de dos intentos simultáneos recibe la fila.
  async consume(input: { tokenHash: string; at: Date }): Promise<{ accountId: string } | null> {
    return this.db.transaction(async (tx) => {
      const [used] = await tx
        .update(emailVerifications)
        .set({ usedAt: input.at })
        .where(
          and(
            eq(emailVerifications.tokenHash, input.tokenHash),
            isNull(emailVerifications.usedAt),
            gt(emailVerifications.expiresAt, input.at),
          ),
        )
        .returning({ accountId: emailVerifications.accountId });
      if (!used) return null;
      await tx
        .update(accounts)
        .set({ emailVerifiedAt: input.at })
        .where(and(eq(accounts.id, used.accountId), isNull(accounts.emailVerifiedAt)));
      return used;
    });
  }

  async targetOf(accountId: string): Promise<VerificationTarget | null> {
    const [found] = await this.db
      .select({ email: accounts.email, verifiedAt: accounts.emailVerifiedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return found ? { email: found.email, verified: found.verifiedAt !== null } : null;
  }
}
