import { CompleteGoogleSignUp } from './complete-google-sign-up';
import { InMemoryGoogleLinks } from './google-doubles.testing';
import { CreatedSessions } from './session-doubles.testing';
import { SignInWithGoogle } from './sign-in-with-google';

const now = new Date('2026-11-21T14:00:00Z');
const signUp = {
  subject: '109876543210987654321',
  email: 'nueva@correo.com',
  suggestedName: 'Nueva Persona',
};

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

  // Mientras la persona estaba en /bienvenida, alguien se registró con ese correo (con contraseña y sin
  // verificarlo). No se crea otra cuenta: se vincula, como al entrar con Google (grill, pregunta 4).
  it('si el correo ya tiene cuenta, la vincula en lugar de crear otra', async () => {
    const someone = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'nueva@correo.com',
      passwordHash: 'hash:de-quien-se-adelanto',
      role: 'reportante' as const,
      suspendedUntil: null,
      deletionScheduledFor: null,
      emailVerified: false,
    };
    const { links, sessions, complete } = setup([someone]);

    await complete.execute({
      signUp,
      displayName: 'Nueva Persona',
      acceptedPolicyVersion: '2026-11',
    });

    expect(links.created).toHaveLength(0);
    expect(links.links).toEqual([
      expect.objectContaining({ accountId: someone.id, forgetPassword: true }),
    ]);
    expect(sessions.created).toEqual([expect.objectContaining({ accountId: someone.id })]);
  });
});
