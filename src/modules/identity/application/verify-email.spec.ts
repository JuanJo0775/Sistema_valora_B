import { InMemoryVerifications, RecordingSender } from './verification-doubles.testing';
import { SendWelcomeEmail } from './send-welcome-email';
import { flushBackground, InMemoryWelcome, RecordingWelcome } from './welcome-doubles.testing';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import { hashVerificationToken } from './verification-token';
import { InvalidVerificationTokenError, VerifyEmail } from './verify-email';

const now = new Date('2026-11-17T14:00:00Z');
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);
const ip = '203.0.113.7';

// Doble del límite: bloquea las claves indicadas y no cuenta nada más.
const limiterBlocking = (blocked: Record<string, number> = {}): AttemptLimiter => ({
  retryAfterSeconds: (key) => blocked[key] ?? null,
  record: () => undefined,
  reset: () => undefined,
});

function setup(blocked: Record<string, number> = {}) {
  const verifications = new InMemoryVerifications();
  verifications.accounts.set('cuenta-1', { email: 'ana@correo.com', verifiedAt: null });
  verifications.accounts.set('cuenta-2', { email: 'beto@correo.com', verifiedAt: null });
  const welcome = new RecordingWelcome();
  const verify = new VerifyEmail({
    verifications,
    limiter: limiterBlocking(blocked),
    clock: { now: () => now },
    welcome,
  });
  const issue = (
    token: string,
    change: Partial<{ expiresAt: Date; usedAt: Date | null; accountId: string }> = {},
  ) =>
    verifications.rows.push({
      id: `v-${token}`,
      accountId: 'cuenta-1',
      tokenHash: hashVerificationToken(token),
      createdAt: now,
      expiresAt: hoursFromNow(23),
      usedAt: null,
      ...change,
    });
  return { verifications, verify, issue, welcome };
}

describe('verificar el correo (ADR-029)', () => {
  it('un token válido marca el token como usado y la cuenta como verificada', async () => {
    const { verifications, verify, issue } = setup();
    issue('token-bueno');

    await verify.execute({ token: 'token-bueno', ip });

    expect(verifications.rows[0]?.usedAt).toEqual(now);
    expect(verifications.accounts.get('cuenta-1')?.verifiedAt).toEqual(now);
    expect(verifications.accounts.get('cuenta-2')?.verifiedAt).toBeNull();
  });

  it.each([
    ['desconocido', 'otro-token', {}],
    ['vencido', 'token-bueno', { expiresAt: hoursFromNow(-1) }],
    ['ya usado', 'token-bueno', { usedAt: hoursFromNow(-2) }],
  ])(
    'un token %s da el mismo error genérico y no cambia nada',
    async (_case, presented, change) => {
      const { verifications, verify, issue } = setup();
      issue('token-bueno', change);

      const attempt = verify.execute({ token: presented, ip });

      await expect(attempt).rejects.toThrow(InvalidVerificationTokenError);
      await expect(attempt).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TOKEN' });
      expect(verifications.accounts.get('cuenta-1')?.verifiedAt).toBeNull();
    },
  );

  it('el token de una cuenta no verifica a otra', async () => {
    const { verifications, verify, issue } = setup();
    issue('token-de-beto', { accountId: 'cuenta-2' });

    await verify.execute({ token: 'token-de-beto', ip });

    expect(verifications.accounts.get('cuenta-1')?.verifiedAt).toBeNull();
    expect(verifications.accounts.get('cuenta-2')?.verifiedAt).toEqual(now);
  });

  it('si la cuenta ya está verificada, un token vigente responde bien y no cambia la fecha original', async () => {
    const { verifications, verify, issue } = setup();
    const before = new Date('2026-11-16T10:00:00Z');
    verifications.accounts.set('cuenta-1', { email: 'ana@correo.com', verifiedAt: before });
    issue('token-bueno');

    await expect(verify.execute({ token: 'token-bueno', ip })).resolves.toBeUndefined();

    expect(verifications.accounts.get('cuenta-1')?.verifiedAt).toEqual(before);
  });

  it('al pasar el límite por IP responde con los segundos que faltan, sin tocar nada', async () => {
    const { verifications, verify, issue } = setup({ [`verificar-ip:${ip}`]: 120 });
    issue('token-bueno');

    const attempt = verify.execute({ token: 'token-bueno', ip });

    await expect(attempt).rejects.toThrow(TooManyAttemptsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 120 });
    expect(verifications.rows[0]?.usedAt).toBeNull();
  });

  describe('correo de bienvenida (ADR-036)', () => {
    it('pide la bienvenida de la cuenta verificada', async () => {
      const { verify, issue, welcome } = setup();
      issue('token-bueno');
      await verify.execute({ token: 'token-bueno', ip });
      expect(welcome.requested).toEqual(['cuenta-1']);
    });

    it('un token invalido no pide ninguna bienvenida', async () => {
      const { verify, welcome } = setup();
      await expect(verify.execute({ token: 'otro', ip })).rejects.toBeInstanceOf(
        InvalidVerificationTokenError,
      );
      expect(welcome.requested).toEqual([]);
    });

    it('si la bienvenida falla, verificar sigue funcionando', async () => {
      const { verifications, verify, issue, welcome } = setup();
      welcome.failWith = new Error('proveedor caido');
      issue('token-bueno');
      await expect(verify.execute({ token: 'token-bueno', ip })).resolves.toBeUndefined();
      await flushBackground();
      expect(verifications.accounts.get('cuenta-1')?.verifiedAt).toEqual(now);
    });

    it('con el envio real, dos enlaces seguidos de la misma cuenta envian una sola bienvenida', async () => {
      const { verifications, issue } = setup();
      const store = new InMemoryWelcome();
      store.accounts.set('cuenta-1', {
        email: 'ana@correo.com',
        displayName: 'Ana',
        verifiedAt: now,
        welcomeSentAt: null,
      });
      const sender = new RecordingSender();
      const verify = new VerifyEmail({
        verifications,
        limiter: limiterBlocking(),
        clock: { now: () => now },
        welcome: new SendWelcomeEmail({
          welcome: store,
          sender,
          clock: { now: () => now },
          appUrl: 'https://valora.example',
          log: { warn: () => undefined },
        }),
      });
      issue('uno');
      issue('dos');
      await verify.execute({ token: 'uno', ip });
      await verify.execute({ token: 'dos', ip });
      await flushBackground();
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0]?.to).toBe('ana@correo.com');
    });
  });
});
