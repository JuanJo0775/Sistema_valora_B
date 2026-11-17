import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EmailVerificationRepository,
  NewEmailVerification,
  StoredEmailVerification,
  VerificationTarget,
} from '../application/email-verification-repository';
import { accounts, emailVerifications } from './schema';

export class DrizzleEmailVerificationRepository implements EmailVerificationRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async deleteUnusedOf(accountId: string): Promise<void> {
    await this.db
      .delete(emailVerifications)
      .where(and(eq(emailVerifications.accountId, accountId), isNull(emailVerifications.usedAt)));
  }

  async create(verification: NewEmailVerification): Promise<void> {
    await this.db.insert(emailVerifications).values(verification);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<(StoredEmailVerification & { accountVerified: boolean }) | null> {
    const [found] = await this.db
      .select({
        id: emailVerifications.id,
        accountId: emailVerifications.accountId,
        tokenHash: emailVerifications.tokenHash,
        createdAt: emailVerifications.createdAt,
        expiresAt: emailVerifications.expiresAt,
        usedAt: emailVerifications.usedAt,
        verifiedAt: accounts.emailVerifiedAt,
      })
      .from(emailVerifications)
      .innerJoin(accounts, eq(emailVerifications.accountId, accounts.id))
      .where(eq(emailVerifications.tokenHash, tokenHash));
    if (!found) return null;
    const { verifiedAt, ...verification } = found;
    return { ...verification, accountVerified: verifiedAt !== null };
  }

  // El token se gasta solo si sigue sin usar (dos peticiones a la vez no lo usan dos veces) y la
  // fecha de verificación se fija solo la primera vez.
  async complete(input: { verificationId: string; accountId: string; at: Date }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(emailVerifications)
        .set({ usedAt: input.at })
        .where(
          and(eq(emailVerifications.id, input.verificationId), isNull(emailVerifications.usedAt)),
        );
      await tx
        .update(accounts)
        .set({ emailVerifiedAt: input.at })
        .where(and(eq(accounts.id, input.accountId), isNull(accounts.emailVerifiedAt)));
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
