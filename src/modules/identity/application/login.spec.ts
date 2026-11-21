import { createHash } from 'node:crypto';
import type { Account, AccountRepository } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
import {
  AccountPendingDeletionError,
  InvalidCredentialsError,
  Login,
  type LoginInput,
  TooManyAttemptsError,
} from './login';
import type { PasswordHasher } from './password-hasher';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';

const now = new Date('2026-11-12T14:00:00Z');
const ana: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@correo.com',
  passwordHash: 'hash:la-clave-de-ana',
  role: 'reportante',
  suspendedUntil: null,
  deletionScheduledFor: null,
};

class FakeHasher implements PasswordHasher {
  readonly verified: string[] = [];

  hash(password: string): Promise<string> {
    return Promise.resolve(`hash:${password}`);
  }

  verify(hash: string, password: string): Promise<boolean> {
    this.verified.push(hash);
    return Promise.resolve(hash === `hash:${password}`);
  }
}

class InMemorySessions implements SessionRepository {
  readonly sessions: NewSession[] = [];

  create(session: NewSession): Promise<void> {
    this.sessions.push(session);
    return Promise.resolve();
  }

  findByTokenHash(): Promise<StoredSession | null> {
    return Promise.reject(new Error('Login no busca sesiones'));
  }

  touch(): Promise<void> {
    return Promise.reject(new Error('Login no actualiza sesiones'));
  }

  revoke(): Promise<void> {
    return Promise.reject(new Error('Login no revoca sesiones'));
  }
}

// Doble del límite: registra las llamadas y bloquea las claves indicadas.
class FakeLimiter implements AttemptLimiter {
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

function setup(blocked: Record<string, number> = {}, account: Account = ana) {
  const accounts: AccountRepository = {
    findByEmail: (email) => Promise.resolve(email === account.email ? account : null),
    create: () => Promise.reject(new Error('Login no crea cuentas')),
    applyRoleChange: () => Promise.reject(new Error('Login no cambia roles')),
  };
  const hasher = new FakeHasher();
  const sessions = new InMemorySessions();
  const limiter = new FakeLimiter(blocked);
  const login = new Login({ accounts, hasher, sessions, limiter, clock: { now: () => now } });
  return { hasher, sessions, limiter, login };
}

const input = (change: Partial<LoginInput> = {}): LoginInput => ({
  email: 'Ana@Correo.com',
  password: 'la-clave-de-ana',
  ip: '203.0.113.7',
  ...change,
});

describe('iniciar sesión', () => {
  it('con credenciales correctas crea una sesión nueva, guarda solo el hash del token y reinicia el contador del correo', async () => {
    const { sessions, limiter, login } = setup();

    const { token, expiresAt } = await login.execute(input());

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(sessions.sessions).toEqual([
      {
        id: expect.any(String) as unknown,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        accountId: ana.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date('2026-12-12T14:00:00Z'),
      },
    ]);
    expect(expiresAt).toEqual(new Date('2026-12-12T14:00:00Z'));
    expect(limiter.resets).toEqual(['login-correo:ana@correo.com']);
  });

  it('una contraseña mala y un correo inexistente dan el mismo error, y los dos verifican un hash', async () => {
    const { hasher, sessions, limiter, login } = setup();

    const wrongPassword = login.execute(input({ password: 'otra-clave' }));
    await expect(wrongPassword).rejects.toThrow(InvalidCredentialsError);
    const unknownEmail = login.execute(input({ email: 'nadie@correo.com' }));
    await expect(unknownEmail).rejects.toThrow(InvalidCredentialsError);

    // También se verifica un hash de relleno: el tiempo no revela si la cuenta existe (pregunta 6).
    expect(hasher.verified).toHaveLength(2);
    expect(sessions.sessions).toHaveLength(0);
    expect(limiter.recorded).toEqual(
      expect.arrayContaining(['login-correo:ana@correo.com', 'login-correo:nadie@correo.com']),
    );
  });

  // ADR-032.
  it('con la contraseña correcta de una cuenta pendiente de eliminación no abre sesión y dice cuándo se borra', async () => {
    const scheduledFor = new Date('2026-11-28T10:00:00Z');
    const { sessions, login } = setup({}, { ...ana, deletionScheduledFor: scheduledFor });

    const attempt = login.execute(input());

    await expect(attempt).rejects.toThrow(AccountPendingDeletionError);
    await expect(attempt).rejects.toMatchObject({ scheduledFor });
    expect(sessions.sessions).toHaveLength(0);
  });

  it('con una contraseña mala, una cuenta pendiente da el mismo error genérico (no revela que existe)', async () => {
    const { login } = setup({}, { ...ana, deletionScheduledFor: new Date('2026-11-28T10:00:00Z') });

    await expect(login.execute(input({ password: 'otra-clave' }))).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it.each([
    ['por correo', 'login-correo:ana@correo.com', 600],
    ['por IP', 'login-ip:203.0.113.7', 120],
  ])(
    'al pasar el límite %s responde con los segundos que faltan, sin verificar la contraseña',
    async (_case, key, seconds) => {
      const { hasher, login } = setup({ [key]: seconds });

      const attempt = login.execute(input());

      await expect(attempt).rejects.toThrow(TooManyAttemptsError);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: seconds });
      expect(hasher.verified).toHaveLength(0);
    },
  );

  it('cada intento cuenta para el límite por IP', async () => {
    const { limiter, login } = setup();

    await login.execute(input());

    expect(limiter.recorded).toEqual(['login-ip:203.0.113.7']);
  });

  // Grill de la #71, pregunta 5 (cambia la pregunta 4 de la #33): una cuenta suspendida inicia
  // sesión para poder apelar; el guard limita las rutas que puede usar.
  it('una cuenta suspendida también inicia sesión', async () => {
    const { sessions, login } = setup(
      {},
      { ...ana, suspendedUntil: new Date('2026-11-19T14:00:00Z') },
    );

    await login.execute(input());

    expect(sessions.sessions).toHaveLength(1);
  });

  it('cuando la suspensión ya terminó, la cuenta inicia sesión', async () => {
    const { sessions, login } = setup(
      {},
      { ...ana, suspendedUntil: new Date('2026-11-12T13:59:59Z') },
    );

    await login.execute(input());

    expect(sessions.sessions).toHaveLength(1);
  });

  it('con la contraseña incorrecta, una cuenta suspendida da el error de siempre', async () => {
    const { login } = setup({}, { ...ana, suspendedUntil: new Date('2026-11-19T14:00:00Z') });

    await expect(login.execute(input({ password: 'otra-clave' }))).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
