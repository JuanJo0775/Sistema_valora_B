import type { Account, AccountRepository } from './account-repository';
import { FakeHasher, FakeLimiter, InMemoryDeletion } from './deletion-doubles.testing';
import { InvalidCredentialsError, type LoginInput, TooManyAttemptsError } from './login';
import { RestoreAccount } from './restore-account';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';

const now = new Date('2026-11-20T14:00:00Z');
const scheduled = new Date('2026-11-28T10:00:00Z');
const id = '11111111-1111-4111-8111-111111111111';

class Sessions implements SessionRepository {
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

function setup(
  deletionScheduledFor: Date | null,
  blocked: Record<string, number> = {},
  passwordHash: string | null = 'hash:la-clave-de-ana',
) {
  const deletion = new InMemoryDeletion();
  deletion.add({
    id,
    passwordHash,
    role: 'reportante',
    deletionScheduledFor,
  });
  const accounts: AccountRepository = {
    findByEmail: (email) => {
      const stored = deletion.accounts.get(id);
      const account: Account | null =
        email === 'ana@correo.com' && stored
          ? {
              id,
              email,
              passwordHash: stored.passwordHash,
              role: stored.role,
              suspendedUntil: null,
              deletionScheduledFor: stored.deletionScheduledFor,
            }
          : null;
      return Promise.resolve(account);
    },
    create: () => Promise.reject(new Error('no se usa')),
    applyRoleChange: () => Promise.reject(new Error('no se usa')),
  };
  const hasher = new FakeHasher();
  const sessions = new Sessions();
  const limiter = new FakeLimiter(blocked);
  const restore = new RestoreAccount({
    accounts,
    deletion,
    hasher,
    sessions,
    limiter,
    clock: { now: () => now },
  });
  return { deletion, hasher, sessions, limiter, restore };
}

const input = (change: Partial<LoginInput> = {}): LoginInput => ({
  email: 'Ana@Correo.com',
  password: 'la-clave-de-ana',
  ip: '203.0.113.7',
  ...change,
});

describe('restaurar una cuenta pendiente de eliminación (ADR-032)', () => {
  it('cancela la eliminación y abre una sesión como el inicio de sesión', async () => {
    const { deletion, sessions, limiter, restore } = setup(scheduled);

    const { token, expiresAt } = await restore.execute(input());

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(expiresAt).toEqual(new Date('2026-12-20T14:00:00Z'));
    expect(deletion.accounts.get(id)?.deletionScheduledFor).toBeNull();
    expect(sessions.created).toHaveLength(1);
    expect(limiter.resets).toEqual(['login-correo:ana@correo.com']);
  });

  it.each([
    ['una contraseña mala', input({ password: 'otra' }), scheduled],
    ['un correo inexistente', input({ email: 'nadie@correo.com' }), scheduled],
    ['una cuenta que no estaba pendiente', input(), null],
  ])('con %s responde el error genérico del login y no abre sesión', async (_c, call, state) => {
    const { deletion, hasher, sessions, restore } = setup(state);

    await expect(restore.execute(call)).rejects.toThrow(InvalidCredentialsError);

    expect(hasher.verified).toHaveLength(1);
    expect(sessions.created).toHaveLength(0);
    expect(deletion.accounts.get(id)?.deletionScheduledFor ?? null).toEqual(state);
  });

  // ADR-029, fase 2 (#179): una cuenta creada con Google no se restaura con contraseña; vuelve a entrar con
  // Google. El error es el genérico, sin revelar que la cuenta existe ni cómo se creó (EC-08).
  it('una cuenta sin contraseña pendiente de eliminación da el error genérico y sigue pendiente', async () => {
    const { deletion, hasher, sessions, limiter, restore } = setup(scheduled, {}, null);

    await expect(restore.execute(input())).rejects.toThrow(InvalidCredentialsError);

    expect(hasher.verified).toHaveLength(1);
    expect(sessions.created).toHaveLength(0);
    expect(deletion.accounts.get(id)?.deletionScheduledFor).toEqual(scheduled);
    expect(limiter.recorded).toContain('login-correo:ana@correo.com');
  });

  it('comparte los límites del login: bloqueada, responde 429 sin verificar la contraseña', async () => {
    const { hasher, restore } = setup(scheduled, { 'login-correo:ana@correo.com': 300 });

    await expect(restore.execute(input())).rejects.toThrow(TooManyAttemptsError);

    expect(hasher.verified).toHaveLength(0);
  });
});
