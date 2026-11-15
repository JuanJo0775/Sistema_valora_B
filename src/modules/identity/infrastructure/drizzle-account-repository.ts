import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AccountCreation } from '../application/reporter-identity';
import type {
  Account,
  AccountRepository,
  NewAccount,
  Role,
} from '../application/account-repository';
import { accounts } from './schema';

export class DrizzleAccountRepository implements AccountRepository, AccountCreation {
  constructor(private readonly db: NodePgDatabase) {}

  async findByEmail(email: string): Promise<Account | null> {
    const [found] = await this.db
      .select({
        id: accounts.id,
        email: accounts.email,
        passwordHash: accounts.passwordHash,
        role: accounts.role,
      })
      .from(accounts)
      .where(eq(accounts.email, email));
    // La restricción CHECK de la tabla garantiza que es uno de los 3 roles.
    return found ? { ...found, role: found.role as Role } : null;
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

  async idByReporterKey(reporterKey: string): Promise<string | null> {
    const [found] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.reporterKey, reporterKey));
    return found?.id ?? null;
  }

  // Dos registros simultáneos con el mismo correo: el índice único deja uno y el otro no falla, así
  // el resultado sigue sin revelar que la cuenta existe (grill de la #16, pregunta 6).
  async create(account: NewAccount): Promise<void> {
    await this.db.insert(accounts).values(account).onConflictDoNothing({ target: accounts.email });
  }
}
