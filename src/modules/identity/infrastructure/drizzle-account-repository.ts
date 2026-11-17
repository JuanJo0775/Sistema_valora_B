import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../../../shared/database/database.module';
import type { AccountCreation } from '../application/reporter-identity';
import type {
  Account,
  AccountRepository,
  NewAccount,
  Role,
  RoleChange,
} from '../application/account-repository';
import type { DisplayNames } from '../application/own-display-name';
import { accounts, roleChanges } from './schema';

export class DrizzleAccountRepository implements AccountRepository, AccountCreation, DisplayNames {
  // Con la conexión o con la transacción del suscriptor del evento (grill de la #33, pregunta 6).
  constructor(private readonly db: NodePgDatabase | Transaction) {}

  async findByEmail(email: string): Promise<Account | null> {
    const [found] = await this.db
      .select({
        id: accounts.id,
        email: accounts.email,
        passwordHash: accounts.passwordHash,
        role: accounts.role,
        suspendedUntil: accounts.suspendedUntil,
      })
      .from(accounts)
      .where(eq(accounts.email, email));
    // La restricción CHECK de la tabla garantiza que es uno de los 3 roles.
    return found ? { ...found, role: found.role as Role } : null;
  }

  // #133: solo para la sesión de la propia cuenta (EC-08).
  async displayNameOf(accountId: string): Promise<string | null> {
    const [found] = await this.db
      .select({ displayName: accounts.displayName })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return found?.displayName ?? null;
  }

  // Grill de la #31, pregunta 2: el día de creación de la cuenta, para la identidad seudónima.
  async createdAtOf(accountId: string): Promise<Date> {
    const [found] = await this.db
      .select({ createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!found) throw new Error('La cuenta de la sesión no existe.');
    return found.createdAt;
  }

  async rememberReporterKey(accountId: string, reporterKey: string): Promise<void> {
    await this.db.update(accounts).set({ reporterKey }).where(eq(accounts.id, accountId));
  }

  async byReporterKey(
    reporterKey: string,
  ): Promise<{ id: string; suspendedUntil: Date | null } | null> {
    const [found] = await this.db
      .select({ id: accounts.id, suspendedUntil: accounts.suspendedUntil })
      .from(accounts)
      .where(eq(accounts.reporterKey, reporterKey));
    return found ?? null;
  }

  async suspend(accountId: string, until: Date | null): Promise<void> {
    await this.db.update(accounts).set({ suspendedUntil: until }).where(eq(accounts.id, accountId));
  }

  async applyRoleChange(change: RoleChange): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ role: change.toRole })
        .where(eq(accounts.id, change.accountId));
      await tx.insert(roleChanges).values(change);
    });
  }

  // Dos registros simultáneos con el mismo correo: el índice único deja uno y el otro no falla, así
  // el resultado sigue sin revelar que la cuenta existe (grill de la #16, pregunta 6).
  async create(account: NewAccount): Promise<void> {
    await this.db.insert(accounts).values(account).onConflictDoNothing({ target: accounts.email });
  }
}
