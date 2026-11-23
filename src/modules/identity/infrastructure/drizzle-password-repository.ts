import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  NewPasswordReset,
  PasswordCredentials,
  PasswordRepository,
} from '../application/password-repository';
import { accounts, passwordResets, sessions } from './schema';

// ADR-033. Cada método es una transacción: nunca queda una contraseña cambiada con sesiones abiertas ni
// un token gastado sin que la contraseña cambie.
export class DrizzlePasswordRepository implements PasswordRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async replaceUnused(accountId: string, reset: NewPasswordReset): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Candado de la cuenta hasta el final de la transacción: dos peticiones a la vez se turnan y el
      // índice único parcial nunca se viola.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}, 1))`);
      await tx
        .delete(passwordResets)
        .where(and(eq(passwordResets.accountId, accountId), isNull(passwordResets.usedAt)));
      await tx.insert(passwordResets).values(reset);
    });
  }

  // Un solo UPDATE atómico gasta el token: solo uno de dos intentos simultáneos recibe la fila.
  async redeem(input: {
    tokenHash: string;
    passwordHash: string;
    at: Date;
  }): Promise<{ accountId: string } | null> {
    return this.db.transaction(async (tx) => {
      const [used] = await tx
        .update(passwordResets)
        .set({ usedAt: input.at })
        .where(
          and(
            eq(passwordResets.tokenHash, input.tokenHash),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, input.at),
          ),
        )
        .returning({ accountId: passwordResets.accountId });
      if (!used) return null;
      // El enlace llegó al correo de la cuenta: eso también prueba que el correo es suyo.
      await tx
        .update(accounts)
        .set({
          passwordHash: input.passwordHash,
          emailVerifiedAt: sql`coalesce(${accounts.emailVerifiedAt}, ${input.at.toISOString()}::timestamptz)`,
        })
        .where(eq(accounts.id, used.accountId));
      await tx
        .update(sessions)
        .set({ revokedAt: input.at })
        .where(and(eq(sessions.accountId, used.accountId), isNull(sessions.revokedAt)));
      return used;
    });
  }

  async credentialsOf(accountId: string): Promise<PasswordCredentials | null> {
    const [found] = await this.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return found ?? null;
  }

  async changePassword(input: {
    accountId: string;
    passwordHash: string;
    keepSessionId: string;
    at: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ passwordHash: input.passwordHash })
        .where(eq(accounts.id, input.accountId));
      await tx
        .update(sessions)
        .set({ revokedAt: input.at })
        .where(
          and(
            eq(sessions.accountId, input.accountId),
            ne(sessions.id, input.keepSessionId),
            isNull(sessions.revokedAt),
          ),
        );
    });
  }
}
