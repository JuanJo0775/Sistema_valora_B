import { InMemoryAttemptLimiter } from '../infrastructure/in-memory-attempt-limiter';
import { TooManyAttemptsError } from './attempt-limiter';
import { FakeHasher } from './deletion-doubles.testing';
import { InMemoryPasswords } from './password-doubles.testing';
import { WeakPasswordError } from './password-policy';
import { InvalidResetTokenError, ResetPassword } from './reset-password';
import { hashVerificationToken } from './verification-token';
import { RecordingWelcome } from './welcome-doubles.testing';

let current = new Date('2026-11-22T10:00:00Z');
const clock = { now: () => current };
const minutes = (count: number) => count * 60 * 1000;

function setup() {
  const passwords = new InMemoryPasswords();
  const hasher = new FakeHasher();
  const welcome = new RecordingWelcome();
  const useCase = new ResetPassword({
    passwords,
    hasher,
    limiter: new InMemoryAttemptLimiter(clock),
    clock,
    welcome,
  });
  passwords.add('cuenta-1', { passwordHash: 'hash:la-vieja-clave', sessions: ['s1', 's2'] });
  passwords.add('cuenta-2', { passwordHash: 'hash:otra-clave-larga', sessions: ['s3'] });
  const issue = (token: string, accountId = 'cuenta-1', ttlMinutes = 60) => {
    passwords.resets.push({
      id: `reset-${token}`,
      accountId,
      tokenHash: hashVerificationToken(token),
      createdAt: current,
      expiresAt: new Date(current.getTime() + minutes(ttlMinutes)),
      usedAt: null,
    });
  };
  return { passwords, hasher, useCase, issue, welcome };
}

const input = (token: string, password = 'una-clave-nueva-larga') => ({
  token,
  password,
  ip: '203.0.113.7',
});

describe('restablecer la contraseña con el enlace (ADR-033)', () => {
  beforeEach(() => {
    current = new Date('2026-11-22T10:00:00Z');
  });

  it('con un token vigente guarda el hash de la contraseña nueva y marca el token usado', async () => {
    const { passwords, useCase, issue } = setup();
    issue('token-bueno');

    await useCase.execute(input('token-bueno'));

    expect(passwords.accounts.get('cuenta-1')?.passwordHash).toBe('hash:una-clave-nueva-larga');
    expect(passwords.resets[0]?.usedAt).toEqual(current);
  });

  it('revoca todas las sesiones de la cuenta y no toca las de otra', async () => {
    const { passwords, useCase, issue } = setup();
    issue('token-bueno');

    await useCase.execute(input('token-bueno'));

    expect(passwords.accounts.get('cuenta-1')?.sessions).toEqual([]);
    expect(passwords.accounts.get('cuenta-2')?.sessions).toEqual(['s3']);
  });

  it('si el correo no estaba verificado queda verificado; si lo estaba, la fecha no cambia', async () => {
    const { passwords, useCase, issue } = setup();
    const verifiedAt = new Date('2026-10-01T00:00:00Z');
    const other = passwords.accounts.get('cuenta-2');
    if (other) other.emailVerifiedAt = verifiedAt;
    issue('token-1');
    issue('token-2', 'cuenta-2');

    await useCase.execute(input('token-1'));
    await useCase.execute(input('token-2'));

    expect(passwords.accounts.get('cuenta-1')?.emailVerifiedAt).toEqual(current);
    expect(passwords.accounts.get('cuenta-2')?.emailVerifiedAt).toEqual(verifiedAt);
  });

  it('una cuenta de Google (sin contraseña) crea su primera contraseña', async () => {
    const { passwords, useCase, issue } = setup();
    passwords.add('cuenta-g', {
      passwordHash: null,
      emailVerifiedAt: new Date('2026-11-01T00:00:00Z'),
    });
    issue('token-g', 'cuenta-g');

    await useCase.execute(input('token-g'));

    expect(passwords.accounts.get('cuenta-g')?.passwordHash).toBe('hash:una-clave-nueva-larga');
  });

  it('un token usado no sirve una segunda vez', async () => {
    const { useCase, issue } = setup();
    issue('token-bueno');
    await useCase.execute(input('token-bueno'));

    await expect(useCase.execute(input('token-bueno', 'otra-clave-larga-1'))).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it('un token vencido no sirve y no cambia la contraseña', async () => {
    const { passwords, useCase, issue } = setup();
    issue('token-viejo');
    current = new Date(current.getTime() + minutes(60));

    await expect(useCase.execute(input('token-viejo'))).rejects.toThrow(InvalidResetTokenError);

    expect(passwords.accounts.get('cuenta-1')?.passwordHash).toBe('hash:la-vieja-clave');
    expect(passwords.accounts.get('cuenta-1')?.sessions).toEqual(['s1', 's2']);
  });

  it('un token inexistente responde el mismo error que uno usado o vencido', async () => {
    const { useCase, issue } = setup();
    issue('token-usado');
    await useCase.execute(input('token-usado'));
    issue('token-viejo', 'cuenta-2', 1);
    current = new Date(current.getTime() + minutes(2));

    const errors = await Promise.all(
      ['nunca-existio', 'token-usado', 'token-viejo'].map((token) =>
        useCase.execute(input(token)).catch((error: unknown) => error),
      ),
    );

    for (const error of errors) {
      expect(error).toBeInstanceOf(InvalidResetTokenError);
      expect(error).toMatchObject({
        code: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ya venció. Pide uno nuevo.',
      });
    }
  });

  it('el token de una cuenta no cambia la contraseña de otra', async () => {
    const { passwords, useCase, issue } = setup();
    issue('token-de-ana', 'cuenta-1');

    await useCase.execute(input('token-de-ana'));

    expect(passwords.accounts.get('cuenta-2')?.passwordHash).toBe('hash:otra-clave-larga');
  });

  it.each([
    ['corta', 'corta'],
    ['demasiado larga', 'x'.repeat(129)],
  ])(
    'una contraseña %s responde WeakPasswordError y no gasta el token',
    async (_case, password) => {
      const { passwords, useCase, issue } = setup();
      issue('token-bueno');

      await expect(useCase.execute(input('token-bueno', password))).rejects.toThrow(
        WeakPasswordError,
      );

      expect(passwords.resets[0]?.usedAt).toBeNull();
      expect(passwords.accounts.get('cuenta-1')?.sessions).toEqual(['s1', 's2']);
      await expect(useCase.execute(input('token-bueno'))).resolves.toBeUndefined();
    },
  );

  it('calcula el hash también con un token inexistente (mismo tiempo)', async () => {
    const { hasher, useCase } = setup();
    const spy = jest.spyOn(hasher, 'hash');

    await expect(useCase.execute(input('nunca-existio'))).rejects.toThrow(InvalidResetTokenError);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('pasado el límite por IP (20 en 15 minutos) responde 429', async () => {
    const { useCase } = setup();
    for (let i = 0; i < 20; i += 1) {
      await expect(useCase.execute(input('x'))).rejects.toThrow(InvalidResetTokenError);
    }

    const attempt = useCase.execute(input('x'));

    await expect(attempt).rejects.toThrow(TooManyAttemptsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 900 });
  });

  describe('correo de bienvenida (ADR-036)', () => {
    it('al restablecer pide la bienvenida de la cuenta (el repositorio decide si es la primera vez)', async () => {
      const { useCase, issue, welcome } = setup();
      issue('token-bueno');
      await useCase.execute(input('token-bueno'));
      expect(welcome.requested).toEqual(['cuenta-1']);
    });

    it('un token invalido no la pide', async () => {
      const { useCase, welcome } = setup();
      await expect(useCase.execute(input('desconocido'))).rejects.toBeInstanceOf(
        InvalidResetTokenError,
      );
      expect(welcome.requested).toEqual([]);
    });

    it('si la bienvenida falla, restablecer sigue funcionando', async () => {
      const { useCase, issue, welcome } = setup();
      welcome.failWith = new Error('proveedor caido');
      issue('token-bueno');
      await expect(useCase.execute(input('token-bueno'))).resolves.toBeUndefined();
    });
  });
});
