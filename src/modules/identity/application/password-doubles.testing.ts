import type {
  NewPasswordReset,
  PasswordCredentials,
  PasswordRepository,
} from './password-repository';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Doble en memoria de PasswordRepository.
export interface FakePasswordAccount {
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  // Sesiones abiertas (ids); las revocadas salen de la lista.
  sessions: string[];
}

export class InMemoryPasswords implements PasswordRepository {
  readonly resets: (NewPasswordReset & { usedAt: Date | null })[] = [];
  readonly accounts = new Map<string, FakePasswordAccount>();

  add(accountId: string, account: Partial<FakePasswordAccount> = {}): FakePasswordAccount {
    const stored = { passwordHash: null, emailVerifiedAt: null, sessions: [], ...account };
    this.accounts.set(accountId, stored);
    return stored;
  }

  replaceUnused(accountId: string, reset: NewPasswordReset): Promise<void> {
    for (const row of this.resets) {
      if (row.accountId === accountId && row.usedAt === null) row.usedAt = reset.createdAt;
    }
    this.resets.push({ ...reset, usedAt: null });
    return Promise.resolve();
  }

  redeem(input: {
    tokenHash: string;
    passwordHash: string;
    at: Date;
  }): Promise<{ accountId: string } | null> {
    const row = this.resets.find((candidate) => candidate.tokenHash === input.tokenHash);
    if (!row || row.usedAt !== null || row.expiresAt <= input.at) return Promise.resolve(null);
    const account = this.accounts.get(row.accountId);
    if (!account) return Promise.resolve(null);
    row.usedAt = input.at;
    account.passwordHash = input.passwordHash;
    account.emailVerifiedAt ??= input.at;
    account.sessions = [];
    return Promise.resolve({ accountId: row.accountId });
  }

  credentialsOf(accountId: string): Promise<PasswordCredentials | null> {
    const account = this.accounts.get(accountId);
    return Promise.resolve(account ? { passwordHash: account.passwordHash } : null);
  }

  changePassword(input: {
    accountId: string;
    passwordHash: string;
    keepSessionId: string;
    at: Date;
  }): Promise<void> {
    const account = this.accounts.get(input.accountId);
    if (account) {
      account.passwordHash = input.passwordHash;
      account.sessions = account.sessions.filter((id) => id === input.keepSessionId);
    }
    return Promise.resolve();
  }
}
