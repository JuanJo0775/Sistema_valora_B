import { createHash } from 'node:crypto';
import { InMemoryVerifications, RecordingSender } from './verification-doubles.testing';
import { SendVerificationEmail } from './send-verification-email';

const now = new Date('2026-11-17T14:00:00Z');

function setup(appUrl = 'https://valora.example') {
  const verifications = new InMemoryVerifications();
  verifications.accounts.set('cuenta-1', { email: 'ana@correo.com', verifiedAt: null });
  const sender = new RecordingSender();
  const send = new SendVerificationEmail({
    verifications,
    sender,
    clock: { now: () => now },
    appUrl,
  });
  return { verifications, sender, send };
}

describe('enviar el correo de verificación (ADR-029)', () => {
  it('guarda el hash del token con vencimiento de 24 horas y envía el enlace a la PWA', async () => {
    const { verifications, sender, send } = setup();

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    const token = sender.lastToken();
    expect(token).toHaveLength(43); // 32 bytes en base64url
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe('ana@correo.com');
    expect(sender.sent[0]?.text).toContain(
      `https://valora.example/verificar-correo?token=${token}`,
    );
    expect(verifications.rows).toEqual([
      {
        id: expect.any(String) as unknown,
        accountId: 'cuenta-1',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        createdAt: now,
        expiresAt: new Date('2026-11-18T14:00:00Z'),
        usedAt: null,
      },
    ]);
  });

  it('nunca guarda el token en claro', async () => {
    const { verifications, sender, send } = setup();

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    expect(JSON.stringify(verifications.rows)).not.toContain(sender.lastToken());
  });

  it('invalida los tokens sin usar anteriores de la cuenta y conserva los usados y los ajenos', async () => {
    const { verifications, sender, send } = setup();
    verifications.rows.push(
      {
        id: 'usado',
        accountId: 'cuenta-1',
        tokenHash: 'h-usado',
        createdAt: now,
        expiresAt: now,
        usedAt: now,
      },
      {
        id: 'pendiente',
        accountId: 'cuenta-1',
        tokenHash: 'h-pendiente',
        createdAt: now,
        expiresAt: now,
        usedAt: null,
      },
      {
        id: 'de-otra',
        accountId: 'cuenta-2',
        tokenHash: 'h-otra',
        createdAt: now,
        expiresAt: now,
        usedAt: null,
      },
    );

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    expect(verifications.rows.map((row) => row.id)).toEqual([
      'usado',
      'de-otra',
      expect.any(String),
    ]);
    expect(sender.sent).toHaveLength(1);
  });

  it('arma el enlace sin doble barra aunque APP_URL termine en /', async () => {
    const { sender, send } = setup('https://valora.example/');

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    expect(sender.sent[0]?.text).toContain('https://valora.example/verificar-correo?token=');
  });

  it('el mensaje dice el asunto y la vigencia y no lleva datos sensibles', async () => {
    const { sender, send } = setup();

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    expect(sender.sent[0]?.subject).toBe('Verifica tu correo en Valora');
    expect(sender.sent[0]?.text).toContain('24 horas');
    expect(sender.sent[0]?.text).not.toContain('ana@correo.com');
  });

  // El correo con estilo (aprobado por el equipo el 21-nov-2026): tarjeta con el logo, título y botón.
  it('trae también la versión con estilo: el botón «Verificar mi correo» lleva al mismo enlace', async () => {
    const { sender, send } = setup();

    await send.execute({ accountId: 'cuenta-1', email: 'ana@correo.com' });

    const html = sender.sent[0]?.html ?? '';
    const link = `https://valora.example/verificar-correo?token=${sender.lastToken()}`;
    expect(html).toContain(`<a href="${link}"`);
    expect(html).toContain('Verificar mi correo');
    expect(html).toContain('Confirma tu correo');
    expect(html).toContain('<img src="https://valora.example/logo-horizontal-claro.png"');
    expect(html).toContain('24 horas');
    expect(html).not.toContain('ana@correo.com');
  });
});
