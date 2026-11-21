import type { Account } from './account-repository';
import type { GoogleAccountLinks, GoogleLink, LinkableAccount } from './google-account-links';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';
import {
  GoogleEmailNotVerifiedError,
  type GoogleIdentity,
  SignInWithGoogle,
} from './sign-in-with-google';

const now = new Date('2026-11-21T14:00:00Z');

// Doble del puerto: cuentas en memoria y los vínculos que se piden.
class InMemoryGoogleLinks implements GoogleAccountLinks {
  readonly links: GoogleLink[] = [];

  constructor(private readonly accounts: (LinkableAccount & { googleSubject?: string })[] = []) {}

  findBySubject(subject: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.find((a) => a.googleSubject === subject) ?? null);
  }

  findByEmail(email: string): Promise<LinkableAccount | null> {
    return Promise.resolve(this.accounts.find((a) => a.email === email) ?? null);
  }

  link(link: GoogleLink): Promise<void> {
    this.links.push(link);
    return Promise.resolve();
  }
}

class InMemorySessions implements SessionRepository {
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

function setup(accounts: ConstructorParameters<typeof InMemoryGoogleLinks>[0] = []) {
  const links = new InMemoryGoogleLinks(accounts);
  const sessions = new InMemorySessions();
  const signIn = new SignInWithGoogle({ links, sessions, clock: { now: () => now } });
  return { links, sessions, signIn };
}

// Lo que Google confirma en el id_token, ya validado por el adaptador (#181).
const google = (change: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  subject: '109876543210987654321',
  email: 'ana@correo.com',
  emailVerified: true,
  name: 'Ana María',
  ...change,
});

describe('entrar con Google (ADR-029, fase 2)', () => {
  it('si Google no verificó el correo, se rechaza y no se vincula ninguna cuenta ni se abre sesión', async () => {
    const { links, sessions, signIn } = setup();

    await expect(signIn.execute(google({ emailVerified: false }))).rejects.toThrow(
      GoogleEmailNotVerifiedError,
    );

    expect(links.links).toHaveLength(0);
    expect(sessions.created).toHaveLength(0);
  });
});
