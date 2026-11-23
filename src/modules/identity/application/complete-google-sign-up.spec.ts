import { CompleteGoogleSignUp } from './complete-google-sign-up';
import { FakeLimiter } from './deletion-doubles.testing';
import { InMemoryGoogleLinks } from './google-doubles.testing';
import { CreatedSessions } from './session-doubles.testing';
import { SignInWithGoogle } from './sign-in-with-google';
import { flushBackground, RecordingWelcome } from './welcome-doubles.testing';

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
  const welcome = new RecordingWelcome();
  const complete = new CompleteGoogleSignUp({
    links,
    sessions,
    clock,
    signIn: new SignInWithGoogle({ links, deletion: links, sessions, clock, welcome }),
    limiter: new FakeLimiter(),
    welcome,
  });
  return { links, sessions, complete, welcome };
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
      ip: '203.0.113.7',
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
      ip: '203.0.113.7',
    });

    expect(links.created).toHaveLength(0);
    expect(links.links).toEqual([
      expect.objectContaining({ accountId: someone.id, forgetPassword: true }),
    ]);
    expect(sessions.created).toEqual([expect.objectContaining({ accountId: someone.id })]);
  });

  describe('correo de bienvenida (ADR-036)', () => {
    const request = {
      signUp,
      displayName: 'Nueva Persona',
      acceptedPolicyVersion: '2026-11',
      ip: '203.0.113.7',
    };

    it('al crearse la cuenta pide la bienvenida una vez, con el id de la cuenta nueva', async () => {
      const { links, complete, welcome } = setup();
      await complete.execute(request);
      expect(welcome.requested).toEqual([links.created[0]?.id]);
    });

    it('si la bienvenida falla, el registro sigue funcionando', async () => {
      const { complete, welcome } = setup();
      welcome.failWith = new Error('proveedor caido');
      await expect(complete.execute(request)).resolves.toMatchObject({
        token: expect.any(String) as unknown,
      });
      await flushBackground();
    });

    it('si el correo ya tenia cuenta verificada, no se pide ninguna bienvenida', async () => {
      const { complete, welcome } = setup([
        {
          id: 'cuenta-1',
          email: 'nueva@correo.com',
          passwordHash: 'hash',
          role: 'reportante',
          suspendedUntil: null,
          deletionScheduledFor: null,
          emailVerified: true,
        },
      ]);
      await complete.execute(request);
      expect(welcome.requested).toEqual([]);
    });
  });
});
