import { InMemoryAttemptLimiter } from '../infrastructure/in-memory-attempt-limiter';
import type { Account, AccountRepository } from './account-repository';
import { TooManyAttemptsError } from './attempt-limiter';
import { EmailSendError } from './email-sender';
import { InMemoryPasswords } from './password-doubles.testing';
import { hashVerificationToken } from './verification-token';
import { RequestPasswordReset } from './request-password-reset';
import { RecordingSender } from './verification-doubles.testing';

let current = new Date('2026-11-22T10:00:00Z');
const clock = { now: () => current };

const account = (change: Partial<Account> = {}): Account => ({
  id: 'cuenta-1',
  email: 'ana@correo.com',
  passwordHash: 'hash:vieja-clave-larga',
  role: 'reportante',
  suspendedUntil: null,
  deletionScheduledFor: null,
  ...change,
});

class Accounts implements AccountRepository {
  constructor(private readonly stored: Account[]) {}

  findByEmail(email: string): Promise<Account | null> {
    return Promise.resolve(this.stored.find((candidate) => candidate.email === email) ?? null);
  }

  create(): Promise<void> {
    return Promise.reject(new Error('no se usa'));
  }

  applyRoleChange(): Promise<void> {
    return Promise.reject(new Error('no se usa'));
  }
}

function setup(stored: Account[] = [account()]) {
  const passwords = new InMemoryPasswords();
  const sender = new RecordingSender();
  const warnings: string[] = [];
  const useCase = new RequestPasswordReset({
    accounts: new Accounts(stored),
    passwords,
    sender,
    limiter: new InMemoryAttemptLimiter(clock),
    clock,
    appUrl: 'https://valora.example/',
    log: { warn: (message) => warnings.push(message) },
  });
  return { passwords, sender, warnings, useCase };
}

const ask = async (useCase: RequestPasswordReset, email = 'ana@correo.com', ip = '203.0.113.7') => {
  await useCase.execute({ email, ip });
  await useCase.settled();
};

describe('olvidé mi contraseña (ADR-033)', () => {
  beforeEach(() => {
    current = new Date('2026-11-22T10:00:00Z');
  });

  it('con una cuenta real envía un correo en español con el enlace, que vence en 1 hora', async () => {
    const { passwords, sender, useCase } = setup();

    await ask(useCase, ' Ana@Correo.com ');

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe('ana@correo.com');
    expect(sender.sent[0]?.text).toMatch(
      /^Hola\. Pediste restablecer[\s\S]*https:\/\/valora\.example\/restablecer-contrasena\?token=[\w-]{43}\n/,
    );
    expect(sender.sent[0]?.text).toContain('vence en 1 hora');
    expect(sender.sent[0]?.text).toContain('ignora este mensaje');
    expect(sender.sent[0]?.html).toContain('/restablecer-contrasena?token=');
    const [row] = passwords.resets;
    expect(row?.accountId).toBe('cuenta-1');
    expect(row?.expiresAt).toEqual(new Date('2026-11-22T11:00:00Z'));
    expect(row?.usedAt).toBeNull();
  });

  it('solo guarda el hash del token, nunca el token', async () => {
    const { passwords, sender, useCase } = setup();

    await ask(useCase);

    const token = sender.lastToken();
    expect(passwords.resets[0]?.tokenHash).toBe(hashVerificationToken(token));
    expect(JSON.stringify(passwords.resets)).not.toContain(token);
  });

  it('sirve igual para una cuenta de Google (sin contraseña): es su primera contraseña', async () => {
    const { sender, useCase } = setup([account({ passwordHash: null })]);

    await ask(useCase);

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.text).toContain('Google');
  });

  it('con una cuenta inexistente responde igual: no envía ni guarda nada', async () => {
    const { passwords, sender, useCase } = setup();

    await expect(ask(useCase, 'nadie@correo.com')).resolves.toBeUndefined();

    expect(sender.sent).toHaveLength(0);
    expect(passwords.resets).toHaveLength(0);
  });

  it('con una cuenta pendiente de eliminación no envía nada', async () => {
    const { passwords, sender, useCase } = setup([
      account({ deletionScheduledFor: new Date('2026-11-30T10:00:00Z') }),
    ]);

    await expect(ask(useCase)).resolves.toBeUndefined();

    expect(sender.sent).toHaveLength(0);
    expect(passwords.resets).toHaveLength(0);
  });

  it('pedir otro enlace invalida el anterior', async () => {
    const { passwords, sender, useCase } = setup();

    await ask(useCase);
    const first = sender.lastToken();
    await ask(useCase);

    expect(passwords.resets).toHaveLength(2);
    expect(passwords.resets.filter((row) => row.usedAt === null)).toHaveLength(1);
    expect(passwords.resets[0]?.tokenHash).toBe(hashVerificationToken(first));
    expect(passwords.resets[0]?.usedAt).not.toBeNull();
    expect(passwords.resets[1]?.tokenHash).toBe(hashVerificationToken(sender.lastToken()));
  });

  it('si el envío falla responde igual y avisa sin el correo ni el token', async () => {
    const { passwords, sender, warnings, useCase } = setup();
    sender.failWith = new EmailSendError('El proveedor de correo respondió 500.');

    await expect(ask(useCase)).resolves.toBeUndefined();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('El proveedor de correo respondió 500.');
    expect(warnings[0]).not.toContain('ana@correo.com');
    expect(passwords.resets[0]?.tokenHash).toBeDefined();
  });

  it('un error inesperado se avisa solo con su nombre', async () => {
    const { sender, warnings, useCase } = setup();
    sender.failWith = new TypeError('detalle con ana@correo.com');

    await ask(useCase);

    expect(warnings).toEqual([
      'No se pudo enviar el correo para restablecer la contraseña: error inesperado (TypeError).',
    ]);
  });

  describe('límites', () => {
    it('la IP puede pedir 5 veces en 15 minutos; la sexta responde 429 aunque el correo no exista', async () => {
      const { sender, useCase } = setup();
      for (let i = 0; i < 5; i += 1) await ask(useCase, `otro${String(i)}@correo.com`);

      const attempt = useCase.execute({ email: 'ana@correo.com', ip: '203.0.113.7' });

      await expect(attempt).rejects.toThrow(TooManyAttemptsError);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 900 });
      expect(sender.sent).toHaveLength(0);
      // Otra IP no está limitada.
      await expect(ask(useCase, 'ana@correo.com', '198.51.100.9')).resolves.toBeUndefined();
      expect(sender.sent).toHaveLength(1);
    });

    it('el correo puede pedir 3 veces por hora; la cuarta responde 429 aunque cambie la IP', async () => {
      const { sender, useCase } = setup();
      for (let i = 0; i < 3; i += 1) await ask(useCase, 'ana@correo.com', `203.0.113.${String(i)}`);

      const attempt = useCase.execute({ email: 'ana@correo.com', ip: '198.51.100.9' });

      await expect(attempt).rejects.toThrow(TooManyAttemptsError);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 3600 });
      expect(sender.sent).toHaveLength(3);
    });

    it('un correo inexistente gasta el mismo límite que uno real', async () => {
      const { useCase } = setup();
      for (let i = 0; i < 3; i += 1) {
        await ask(useCase, 'nadie@correo.com', `203.0.113.${String(i)}`);
      }

      await expect(
        useCase.execute({ email: 'nadie@correo.com', ip: '198.51.100.9' }),
      ).rejects.toThrow(TooManyAttemptsError);
    });

    it('pasada la ventana se puede pedir otra vez', async () => {
      const { sender, useCase } = setup();
      for (let i = 0; i < 3; i += 1) await ask(useCase, 'ana@correo.com', `203.0.113.${String(i)}`);

      current = new Date('2026-11-22T11:00:01Z');
      await ask(useCase, 'ana@correo.com', '198.51.100.9');

      expect(sender.sent).toHaveLength(4);
    });
  });
});
