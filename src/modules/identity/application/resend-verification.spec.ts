import { InMemoryVerifications, RecordingSender } from './verification-doubles.testing';
import { InMemoryAttemptLimiter } from '../infrastructure/in-memory-attempt-limiter';
import { TooManyAttemptsError } from './attempt-limiter';
import { ResendVerification } from './resend-verification';
import { SendVerificationEmail } from './send-verification-email';

let current = new Date('2026-11-17T14:00:00Z');
const clock = { now: () => current };

function setup() {
  const verifications = new InMemoryVerifications();
  verifications.accounts.set('cuenta-1', { email: 'ana@correo.com', verifiedAt: null });
  verifications.accounts.set('cuenta-2', { email: 'beto@correo.com', verifiedAt: null });
  const sender = new RecordingSender();
  const resend = new ResendVerification({
    verifications,
    limiter: new InMemoryAttemptLimiter(clock),
    send: new SendVerificationEmail({
      verifications,
      sender,
      clock,
      appUrl: 'https://valora.example',
    }),
  });
  return { verifications, sender, resend };
}

describe('reenviar el correo de verificación (ADR-029)', () => {
  beforeEach(() => {
    current = new Date('2026-11-17T14:00:00Z');
  });

  it('manda un enlace nuevo al correo de la cuenta de la sesión y deja solo el último vigente', async () => {
    const { verifications, sender, resend } = setup();

    await resend.execute({ accountId: 'cuenta-1' });
    const first = sender.lastToken();
    await resend.execute({ accountId: 'cuenta-1' });

    expect(sender.sent.map((message) => message.to)).toEqual(['ana@correo.com', 'ana@correo.com']);
    expect(sender.lastToken()).not.toBe(first);
    expect(verifications.rows).toHaveLength(1);
  });

  it('si la cuenta ya está verificada no envía nada y responde igual', async () => {
    const { verifications, sender, resend } = setup();
    verifications.accounts.set('cuenta-1', { email: 'ana@correo.com', verifiedAt: current });

    await expect(resend.execute({ accountId: 'cuenta-1' })).resolves.toBeUndefined();

    expect(sender.sent).toEqual([]);
    expect(verifications.rows).toEqual([]);
  });

  it('permite 3 reenvíos por hora por cuenta; el cuarto da los segundos de espera', async () => {
    const { sender, resend } = setup();
    for (let i = 0; i < 3; i += 1) await resend.execute({ accountId: 'cuenta-1' });

    const attempt = resend.execute({ accountId: 'cuenta-1' });

    await expect(attempt).rejects.toThrow(TooManyAttemptsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 3600 });
    expect(sender.sent).toHaveLength(3);
  });

  it('el límite es por cuenta: otra cuenta sigue pudiendo y, pasada la hora, la primera también', async () => {
    const { resend } = setup();
    for (let i = 0; i < 3; i += 1) await resend.execute({ accountId: 'cuenta-1' });

    await expect(resend.execute({ accountId: 'cuenta-2' })).resolves.toBeUndefined();
    current = new Date(current.getTime() + 61 * 60 * 1000);
    await expect(resend.execute({ accountId: 'cuenta-1' })).resolves.toBeUndefined();
  });
});
