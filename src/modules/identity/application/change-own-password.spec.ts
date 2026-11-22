import { InMemoryAttemptLimiter } from '../infrastructure/in-memory-attempt-limiter';
import { TooManyAttemptsError } from './attempt-limiter';
import { ChangeOwnPassword } from './change-own-password';
import { AccountGoneError, InvalidPasswordError } from './delete-own-account';
import { FakeHasher } from './deletion-doubles.testing';
import { InMemoryPasswords } from './password-doubles.testing';
import { WeakPasswordError } from './password-policy';
import { ReauthRequiredError } from './recent-session';

const now = new Date('2026-11-22T10:00:00Z');
const minutesAgo = (count: number) => new Date(now.getTime() - count * 60 * 1000);
const clock = { now: () => now };

function setup(passwordHash: string | null = 'hash:la-clave-actual') {
  const passwords = new InMemoryPasswords();
  passwords.add('cuenta-1', { passwordHash, sessions: ['actual', 'otra', 'tercera'] });
  const hasher = new FakeHasher();
  const limiter = new InMemoryAttemptLimiter(clock);
  const useCase = new ChangeOwnPassword({ passwords, hasher, limiter, clock });
  return { passwords, hasher, useCase };
}

const input = (change: Record<string, unknown> = {}) => ({
  accountId: 'cuenta-1',
  sessionId: 'actual',
  sessionCreatedAt: minutesAgo(60 * 24),
  ip: '203.0.113.7',
  currentPassword: 'la-clave-actual',
  newPassword: 'una-clave-nueva-larga',
  ...change,
});

describe('cambiar la propia contraseña (ADR-033)', () => {
  describe('cuenta con contraseña', () => {
    it('con la actual correcta guarda la nueva y cierra las otras sesiones; la actual sigue', async () => {
      const { passwords, useCase } = setup();

      await useCase.execute(input());

      const stored = passwords.accounts.get('cuenta-1');
      expect(stored?.passwordHash).toBe('hash:una-clave-nueva-larga');
      expect(stored?.sessions).toEqual(['actual']);
    });

    it('con la actual incorrecta responde InvalidPasswordError y no cambia nada', async () => {
      const { passwords, useCase } = setup();

      await expect(useCase.execute(input({ currentPassword: 'otra' }))).rejects.toThrow(
        InvalidPasswordError,
      );

      expect(passwords.accounts.get('cuenta-1')?.passwordHash).toBe('hash:la-clave-actual');
      expect(passwords.accounts.get('cuenta-1')?.sessions).toHaveLength(3);
    });

    it('sin la actual responde InvalidPasswordError sin verificar ningún hash', async () => {
      const { hasher, useCase } = setup();

      await expect(useCase.execute(input({ currentPassword: undefined }))).rejects.toThrow(
        InvalidPasswordError,
      );

      expect(hasher.verified).toHaveLength(0);
    });

    it('la antigüedad de la sesión no importa', async () => {
      const { useCase } = setup();

      await expect(
        useCase.execute(input({ sessionCreatedAt: minutesAgo(60 * 24 * 20) })),
      ).resolves.toBeUndefined();
    });

    it('5 fallos por cuenta bloquean con 429, como al eliminar la cuenta', async () => {
      const { hasher, useCase } = setup();
      for (let i = 0; i < 5; i += 1) {
        await expect(useCase.execute(input({ currentPassword: 'mala' }))).rejects.toThrow(
          InvalidPasswordError,
        );
      }
      hasher.verified.length = 0;

      const attempt = useCase.execute(input());

      await expect(attempt).rejects.toThrow(TooManyAttemptsError);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 900 });
      expect(hasher.verified).toHaveLength(0);
    });

    it('20 intentos por IP bloquean con 429', async () => {
      const { useCase } = setup();
      // La nueva es igual a la actual: cada intento sigue siendo válido.
      for (let i = 0; i < 20; i += 1) {
        await useCase.execute(input({ newPassword: 'la-clave-actual' }));
      }

      await expect(useCase.execute(input())).rejects.toThrow(TooManyAttemptsError);
    });

    it('una contraseña nueva débil responde WeakPasswordError y no cambia nada', async () => {
      const { passwords, useCase } = setup();

      await expect(useCase.execute(input({ newPassword: 'corta' }))).rejects.toThrow(
        WeakPasswordError,
      );

      expect(passwords.accounts.get('cuenta-1')?.passwordHash).toBe('hash:la-clave-actual');
      expect(passwords.accounts.get('cuenta-1')?.sessions).toHaveLength(3);
    });
  });

  describe('cuenta sin contraseña (Google)', () => {
    it.each([
      ['recién abierta', 1],
      ['de exactamente 10 minutos', 10],
    ])(
      'con la sesión %s crea la contraseña sin pedir la actual y cierra las otras sesiones',
      async (_case, minutes) => {
        const { passwords, hasher, useCase } = setup(null);

        await useCase.execute(
          input({ currentPassword: undefined, sessionCreatedAt: minutesAgo(minutes) }),
        );

        const stored = passwords.accounts.get('cuenta-1');
        expect(stored?.passwordHash).toBe('hash:una-clave-nueva-larga');
        expect(stored?.sessions).toEqual(['actual']);
        expect(hasher.verified).toHaveLength(0);
      },
    );

    it('con la sesión de más de 10 minutos responde ReauthRequiredError y no cambia nada', async () => {
      const { passwords, useCase } = setup(null);

      await expect(
        useCase.execute(input({ currentPassword: undefined, sessionCreatedAt: minutesAgo(11) })),
      ).rejects.toThrow(ReauthRequiredError);

      expect(passwords.accounts.get('cuenta-1')?.passwordHash).toBeNull();
      expect(passwords.accounts.get('cuenta-1')?.sessions).toHaveLength(3);
    });

    it('una contraseña débil responde WeakPasswordError', async () => {
      const { useCase } = setup(null);

      await expect(
        useCase.execute(
          input({
            currentPassword: undefined,
            sessionCreatedAt: minutesAgo(1),
            newPassword: 'corta',
          }),
        ),
      ).rejects.toThrow(WeakPasswordError);
    });
  });

  it('una cuenta que ya no existe responde AccountGoneError', async () => {
    const { useCase } = setup();

    await expect(useCase.execute(input({ accountId: 'no-existe' }))).rejects.toThrow(
      AccountGoneError,
    );
  });
});
