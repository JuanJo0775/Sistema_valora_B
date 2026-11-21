import type { Account } from './account-repository';
import { CompleteGoogleSignUp } from './complete-google-sign-up';
import type {
  GoogleAccountLinks,
  GoogleLink,
  LinkableAccount,
  NewGoogleAccount,
} from './google-account-links';
import { CreatedSessions } from './session-doubles.testing';
import { SignInWithGoogle } from './sign-in-with-google';

const now = new Date('2026-11-21T14:00:00Z');
const signUp = {
  subject: '109876543210987654321',
  email: 'nueva@correo.com',
  suggestedName: 'Nueva Persona',
};

// Doble del puerto: cuentas en memoria; createLinked respeta el correo único como la base.
class InMemoryGoogleLinks implements GoogleAccountLinks {
  readonly created: NewGoogleAccount[] = [];
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

  createLinked(account: NewGoogleAccount): Promise<boolean> {
    if (this.accounts.some((a) => a.email === account.email)) return Promise.resolve(false);
    this.created.push(account);
    return Promise.resolve(true);
  }
}

function setup(accounts: ConstructorParameters<typeof InMemoryGoogleLinks>[0] = []) {
  const links = new InMemoryGoogleLinks(accounts);
  const sessions = new CreatedSessions();
  const clock = { now: () => now };
  const complete = new CompleteGoogleSignUp({
    links,
    sessions,
    clock,
    signIn: new SignInWithGoogle({ links, sessions, clock }),
  });
  return { links, sessions, complete };
}

// RF-001 y grill de la #178, pregunta 2: la cuenta de quien entró con Google se crea al aceptar la
// política en /bienvenida.
describe('completar el registro de quien entró con Google', () => {
  it('crea una cuenta reportante sin contraseña, con el correo verificado, vinculada y con la política aceptada', async () => {
    const { links, sessions, complete } = setup();

    const result = await complete.execute({
      signUp,
      displayName: '  Nueva   Persona ',
      acceptedPolicyVersion: '2026-11',
    });

    expect(links.created).toEqual([
      {
        id: expect.any(String) as unknown,
        email: 'nueva@correo.com',
        displayName: 'Nueva Persona',
        role: 'reportante',
        policyVersion: '2026-11',
        policyAcceptedAt: now,
        googleSubject: signUp.subject,
        emailVerifiedAt: now,
      },
    ]);
    expect(sessions.created).toEqual([
      expect.objectContaining({ accountId: links.created[0]?.id }),
    ]);
    expect(result.token).toEqual(expect.any(String));
  });
});
