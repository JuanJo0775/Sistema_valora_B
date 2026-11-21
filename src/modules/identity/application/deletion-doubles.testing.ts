import type { AccountDeletionRepository, ScheduleOutcome } from './account-deletion-repository';
import type { Role } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
import type { PasswordHasher } from './password-hasher';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Dobles en memoria de la eliminación de
// cuenta, para las pruebas unitarias.
export interface FakeAccount {
  id: string;
  // null: cuenta creada con Google, sin contraseña (#179).
  passwordHash: string | null;
  role: Role;
  deletionScheduledFor: Date | null;
}

export class InMemoryDeletion implements AccountDeletionRepository {
  readonly accounts = new Map<string, FakeAccount>();
  // Cuentas cuya purga falla (fallo parcial).
  readonly failing = new Set<string>();
  readonly revoked: string[] = [];

  add(account: FakeAccount): FakeAccount {
    this.accounts.set(account.id, account);
    return account;
  }

  passwordHashOf(accountId: string): Promise<string | null> {
    return Promise.resolve(this.accounts.get(accountId)?.passwordHash ?? null);
  }

  schedule(input: { accountId: string; scheduledFor: Date }): Promise<ScheduleOutcome> {
    const own = this.accounts.get(input.accountId);
    if (!own) return Promise.resolve({ outcome: 'gone' });
    this.revoked.push(input.accountId);
    if (own.deletionScheduledFor) {
      return Promise.resolve({ outcome: 'scheduled', scheduledFor: own.deletionScheduledFor });
    }
    const others = [...this.accounts.values()].filter(
      (account) =>
        account.role === 'moderador' && account.id !== own.id && !account.deletionScheduledFor,
    );
    if (own.role === 'moderador' && others.length === 0) {
      return Promise.resolve({ outcome: 'last-moderator' });
    }
    own.deletionScheduledFor = input.scheduledFor;
    return Promise.resolve({ outcome: 'scheduled', scheduledFor: input.scheduledFor });
  }

  cancel(accountId: string): Promise<boolean> {
    const own = this.accounts.get(accountId);
    if (!own?.deletionScheduledFor) return Promise.resolve(false);
    own.deletionScheduledFor = null;
    return Promise.resolve(true);
  }

  dueAccountIds(now: Date, limit: number): Promise<string[]> {
    return Promise.resolve(
      [...this.accounts.values()]
        .filter((account) => account.deletionScheduledFor && account.deletionScheduledFor <= now)
        .slice(0, limit)
        .map((account) => account.id),
    );
  }

  purge(accountId: string, now: Date): Promise<boolean> {
    if (this.failing.has(accountId)) return Promise.reject(new Error('fallo de la base'));
    const own = this.accounts.get(accountId);
    if (!own?.deletionScheduledFor || own.deletionScheduledFor > now) return Promise.resolve(false);
    this.accounts.delete(accountId);
    return Promise.resolve(true);
  }
}

export class FakeHasher implements PasswordHasher {
  readonly verified: string[] = [];

  hash(password: string): Promise<string> {
    return Promise.resolve(`hash:${password}`);
  }

  verify(hash: string, password: string): Promise<boolean> {
    this.verified.push(hash);
    return Promise.resolve(hash === `hash:${password}`);
  }
}

// Doble del límite: bloquea las claves indicadas y cuenta lo registrado.
export class FakeLimiter implements AttemptLimiter {
  readonly recorded: string[] = [];
  readonly resets: string[] = [];

  constructor(private readonly blocked: Record<string, number> = {}) {}

  retryAfterSeconds(key: string): number | null {
    return this.blocked[key] ?? null;
  }

  record(key: string): void {
    this.recorded.push(key);
  }

  reset(key: string): void {
    this.resets.push(key);
  }
}
