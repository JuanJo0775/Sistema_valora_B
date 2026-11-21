import type { Account } from './account-repository';
import type { GoogleAccountLinks, GoogleLink, LinkableAccount } from './google-account-links';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';
import {
  GoogleEmailNotVerifiedError,
  type GoogleIdentity,
  SignInWithGoogle,
} from './sign-in-with-google';

const now = new Date('2026-11-21T14:00:00Z');
const ana = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@correo.com',
  passwordHash: 'hash:la-clave-de-ana',
  role: 'reportante' as const,
  suspendedUntil: null,
  deletionScheduledFor: null,
  emailVerified: true,
};

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

  it('una cuenta ya vinculada a ese sub de Google entra y abre una sesión, sin volver a vincular', async () => {
    const { links, sessions, signIn } = setup([{ ...ana, googleSubject: '109876543210987654321' }]);

    const result = await signIn.execute(google());

    expect(result).toMatchObject({ outcome: 'signed-in', token: expect.any(String) as unknown });
    expect(sessions.created).toEqual([
      expect.objectContaining({ accountId: ana.id, createdAt: now }),
    ]);
    expect(links.links).toHaveLength(0);
  });

  // RF-001 y grill de la #178, pregunta 2: pulsar el botón de Google no es aceptar la política.
  it('un correo sin cuenta no crea nada: pide aceptar la política con el correo y el nombre que da Google', async () => {
    const { links, sessions, signIn } = setup();

    const result = await signIn.execute(
      google({ email: 'Nueva@Correo.com', name: 'Nueva Persona' }),
    );

    expect(result).toEqual({
      outcome: 'needs-policy',
      subject: '109876543210987654321',
      email: 'nueva@correo.com',
      suggestedName: 'Nueva Persona',
    });
    expect(sessions.created).toHaveLength(0);
    expect(links.links).toHaveLength(0);
  });

  // ADR-029, fase 2, punto 2: el correo de Google coincide con una cuenta; se vincula a ella.
  it('un correo con cuenta verificada se vincula a ese sub, conserva su contraseña y abre sesión', async () => {
    const { links, sessions, signIn } = setup([{ ...ana }]);

    const result = await signIn.execute(google({ email: 'ANA@correo.com' }));

    expect(result).toMatchObject({ outcome: 'signed-in' });
    expect(links.links).toEqual([
      {
        accountId: ana.id,
        subject: '109876543210987654321',
        verifiedAt: now,
        forgetPassword: false,
      },
    ]);
    expect(sessions.created).toEqual([expect.objectContaining({ accountId: ana.id })]);
  });

  // Grill de la #178, pregunta 4: alguien pudo registrar con contraseña el correo ajeno sin verificarlo.
  // Al vincularlo, la dueña real del correo no debe compartir la cuenta con esa persona.
  it('un correo con cuenta sin verificar se vincula, pierde la contraseña y sus sesiones abiertas', async () => {
    const { links, sessions, signIn } = setup([{ ...ana, emailVerified: false }]);

    const result = await signIn.execute(google());

    expect(result).toMatchObject({ outcome: 'signed-in' });
    expect(links.links).toEqual([
      expect.objectContaining({ accountId: ana.id, forgetPassword: true }),
    ]);
    // La sesión nueva se abre después de cerrar las anteriores (lo hace link en su transacción).
    expect(sessions.created).toHaveLength(1);
  });
});
