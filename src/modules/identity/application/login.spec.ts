import { createHash } from 'node:crypto';
import type { Account, AccountRepository } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
import { Login, type LoginInput } from './login';
import type { PasswordHasher } from './password-hasher';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';

const now = new Date('2026-11-12T14:00:00Z');
const ana: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@correo.com',
  passwordHash: 'hash:la-clave-de-ana',
  role: 'reportante',
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

function setup(blocked: Record<string, number> = {}) {
  const accounts: AccountRepository = {
    findByEmail: (email) => Promise.resolve(email === ana.email ? ana : null),
    create: () => Promise.reject(new Error('Login no crea cuentas')),
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
});
