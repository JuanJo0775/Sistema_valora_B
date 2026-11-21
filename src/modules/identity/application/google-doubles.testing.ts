import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Account, AccountRepository, NewAccount } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
import type {
  ExternalIdentityRepository,
  IdentityProvider,
} from './external-identity-repository';
import type { GoogleIdentity, OidcProvider } from './google-oidc';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Un «mundo» en memoria con las cuentas, las
// identidades y las sesiones, para probar el inicio con Google sin base de datos.
export interface WorldAccount extends Account {
  displayName: string | null;
  policyVersion: string | null;
}

export class GoogleWorld
  implements AccountRepository, ExternalIdentityRepository, AccountDeletionRepository
{
  readonly accounts = new Map<string, WorldAccount>();
  // clave «proveedor:sub» -> id de la cuenta
  readonly identities = new Map<string, string>();
  readonly revokedAccounts: string[] = [];

  add(account: Partial<WorldAccount> & { id: string; email: string }): WorldAccount {
    const full: WorldAccount = {
      passwordHash: 'hash:la-clave',
      role: 'reportante',
      suspendedUntil: null,
      deletionScheduledFor: null,
      emailVerifiedAt: new Date('2026-11-01T00:00:00Z'),
      displayName: null,
      policyVersion: '2026-11',
      ...account,
    };
    this.accounts.set(full.id, full);
    return full;
  }

  linked(provider: IdentityProvider, subject: string, accountId: string): void {
    this.identities.set(`${provider}:${subject}`, accountId);
  }

  // AccountRepository
  findByEmail(email: string): Promise<Account | null> {
    return Promise.resolve([...this.accounts.values()].find((a) => a.email === email) ?? null);
  }
  create(account: NewAccount): Promise<void> {
    this.add({ ...account, emailVerifiedAt: account.emailVerifiedAt ?? null });
    return Promise.resolve();
  }
  applyRoleChange(): Promise<void> {
    return Promise.reject(new Error('no se usa'));
  }

  // ExternalIdentityRepository
  findAccountBySubject(provider: IdentityProvider, subject: string): Promise<Account | null> {
    const id = this.identities.get(`${provider}:${subject}`);
    return Promise.resolve((id && this.accounts.get(id)) || null);
  }
  hasIdentity(accountId: string, provider: IdentityProvider): Promise<boolean> {
    return Promise.resolve(
      [...this.identities.entries()].some(
        ([key, id]) => id === accountId && key.startsWith(`${provider}:`),
      ),
    );
  }
  link(input: {
    accountId: string;
    provider: IdentityProvider;
    subject: string;
    now: Date;
    claimUnverified: boolean;
  }): Promise<void> {
    const key = `${input.provider}:${input.subject}`;
    if (this.identities.has(key)) return Promise.reject(new Error('sub ya enlazado'));
    const account = this.accounts.get(input.accountId);
    if (!account) return Promise.reject(new Error('sin cuenta'));
    if (input.claimUnverified) {
      account.passwordHash = null;
      account.emailVerifiedAt = input.now;
      this.revokedAccounts.push(account.id);
    }
    this.identities.set(key, account.id);
    return Promise.resolve();
  }
  createWithIdentity(input: {
    account: NewAccount;
    provider: IdentityProvider;
    subject: string;
    now: Date;
  }): Promise<void> {
    this.add({ ...input.account, emailVerifiedAt: input.account.emailVerifiedAt ?? null });
    this.identities.set(`${input.provider}:${input.subject}`, input.account.id);
    return Promise.resolve();
  }

  // AccountDeletionRepository: solo cancel() se usa.
  cancel(accountId: string): Promise<boolean> {
    const account = this.accounts.get(accountId);
    if (!account?.deletionScheduledFor) return Promise.resolve(false);
    account.deletionScheduledFor = null;
    return Promise.resolve(true);
  }
  credentialsOf(): Promise<{ passwordHash: string | null } | null> {
    return Promise.reject(new Error('no se usa'));
  }
  schedule(): Promise<never> {
    return Promise.reject(new Error('no se usa'));
  }
  dueAccountIds(): Promise<string[]> {
    return Promise.reject(new Error('no se usa'));
  }
  purge(): Promise<boolean> {
    return Promise.reject(new Error('no se usa'));
  }
}

export class RecordingSessions implements SessionRepository {
  readonly created: NewSession[] = [];
  create(session: NewSession): Promise<void> {
    this.created.push(session);
    return Promise.resolve();
  }
  findByTokenHash(): Promise<StoredSession | null> {
    return Promise.reject(new Error('no se usa'));
  }
  touch(): Promise<void> {
    return Promise.reject(new Error('no se usa'));
  }
  revoke(): Promise<void> {
    return Promise.reject(new Error('no se usa'));
  }
}

// Proveedor simulado: devuelve (o lanza) lo que la prueba le diga y recuerda lo que se le pidió.
export class FakeOidc implements OidcProvider {
  identity: GoogleIdentity | Error = {
    subject: 'sub-ana',
    email: 'ana@correo.com',
    emailVerified: true,
    name: 'Ana Pérez',
    nonce: null,
  };
  readonly exchanges: { code: string; codeVerifier: string; redirectUri: string }[] = [];
  lastUrl: URL | null = null;

  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('redirect_uri', input.redirectUri);
    this.lastUrl = url;
    return url.toString();
  }

  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<GoogleIdentity> {
    this.exchanges.push(input);
    if (this.identity instanceof Error) return Promise.reject(this.identity);
    return Promise.resolve({
      ...this.identity,
      nonce: this.identity.nonce ?? this.lastUrl?.searchParams.get('nonce') ?? null,
    });
  }
}

export class OpenLimiter implements AttemptLimiter {
  readonly blocked = new Set<string>();
  retryAfterSeconds(key: string): number | null {
    return this.blocked.has(key) ? 60 : null;
  }
  record(): void {}
  reset(): void {}
}
