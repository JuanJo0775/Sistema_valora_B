import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Account, Role } from '../application/account-repository';
import type {
  GoogleAccountLinks,
  GoogleLink,
  LinkableAccount,
  NewGoogleAccount,
} from '../application/google-account-links';
import { accounts, sessions } from './schema';

const accountColumns = {
  id: accounts.id,
  email: accounts.email,
  passwordHash: accounts.passwordHash,
  role: accounts.role,
  suspendedUntil: accounts.suspendedUntil,
  deletionScheduledFor: accounts.deletionScheduledFor,
  emailVerifiedAt: accounts.emailVerifiedAt,
};

type AccountRow = Omit<Account, 'role'> & { role: string; emailVerifiedAt: Date | null };

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    // La restricción CHECK de la tabla garantiza que es uno de los 3 roles.
    role: row.role as Role,
    suspendedUntil: row.suspendedUntil,
    deletionScheduledFor: row.deletionScheduledFor,
  };
}

function toLinkable(row: AccountRow): LinkableAccount {
  return { ...toAccount(row), emailVerified: row.emailVerifiedAt !== null };
}

// ADR-029, fase 2 (#180): el vínculo de una cuenta con su `sub` de Google.
export class DrizzleGoogleAccountLinks implements GoogleAccountLinks {
  constructor(private readonly db: NodePgDatabase) {}

  async findBySubject(subject: string): Promise<Account | null> {
    const [found] = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(eq(accounts.googleSubject, subject));
    return found ? toAccount(found) : null;
  }

  async findByEmail(email: string): Promise<LinkableAccount | null> {
    const [found] = await this.db
      .select(accountColumns)
      .from(accounts)
      .where(eq(accounts.email, email));
    return found ? toLinkable(found) : null;
  }

  // Una transacción: nunca queda una cuenta vinculada que conserve la contraseña o las sesiones que
  // debía perder. El índice único de google_subject impide vincular el mismo sub a dos cuentas.
  link(link: GoogleLink): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({
          googleSubject: link.subject,
          emailVerifiedAt: link.verifiedAt,
          ...(link.forgetPassword ? { passwordHash: null } : {}),
        })
        .where(eq(accounts.id, link.accountId));
      if (link.forgetPassword) {
        await tx
          .update(sessions)
          .set({ revokedAt: link.verifiedAt })
          .where(and(eq(sessions.accountId, link.accountId), isNull(sessions.revokedAt)));
      }
    });
  }

  // El índice único del correo decide si otra petición la creó primero.
  async createLinked(account: NewGoogleAccount): Promise<boolean> {
    const created = await this.db
      .insert(accounts)
      .values({ ...account, passwordHash: null })
      .onConflictDoNothing({ target: accounts.email })
      .returning({ id: accounts.id });
    return created.length > 0;
  }
}
