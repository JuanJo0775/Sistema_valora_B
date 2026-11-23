import { EmailSendError } from './email-sender';
import { SendWelcomeEmail, sendWelcomeInBackground } from './send-welcome-email';
import { RecordingSender } from './verification-doubles.testing';
import { InMemoryWelcome, RecordingWelcome } from './welcome-doubles.testing';

const now = new Date('2026-11-22T15:00:00Z');

function setup() {
  const welcome = new InMemoryWelcome();
  welcome.accounts.set('nueva', {
    email: 'ana@correo.com',
    displayName: 'Ana María',
    verifiedAt: now,
    welcomeSentAt: null,
  });
  welcome.accounts.set('sin-verificar', {
    email: 'beto@correo.com',
    displayName: 'Beto',
    verifiedAt: null,
    welcomeSentAt: null,
  });
  welcome.accounts.set('anterior', {
    email: 'cata@correo.com',
    displayName: null,
    verifiedAt: now,
    // La migración dejó la fecha de las cuentas existentes: no reciben el correo.
    welcomeSentAt: new Date('2026-11-01T00:00:00Z'),
  });
  const sender = new RecordingSender();
  const warnings: string[] = [];
  const useCase = new SendWelcomeEmail({
    welcome,
    sender,
    clock: { now: () => now },
    appUrl: 'https://valora.example/',
    from: 'Valora <no-responder@valora.example>',
    log: {
      warn: (message) => {
        warnings.push(message);
      },
    },
  });
  return { welcome, sender, warnings, useCase };
}

describe('enviar la bienvenida (ADR-036)', () => {
  it('envía el correo a la cuenta recién verificada y marca la fecha con el reloj', async () => {
    const { welcome, sender, useCase } = setup();

    await useCase.execute('nueva');

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      to: 'ana@correo.com',
      subject: 'Te damos la bienvenida a Valora',
    });
    expect(sender.sent[0]?.text).toContain('Hola Ana,');
    expect(sender.sent[0]?.text).toContain('Abrir Valora: https://valora.example\n');
    expect(sender.sent[0]?.text).toContain('Gracias por sumarte.\nValora');
    expect(sender.sent[0]?.html).toContain('href="https://valora.example"');
    expect(welcome.accounts.get('nueva')?.welcomeSentAt).toEqual(now);
  });

  it('no la reenvía: una segunda vez no envía nada', async () => {
    const { sender, useCase } = setup();
    await useCase.execute('nueva');
    await useCase.execute('nueva');
    expect(sender.sent).toHaveLength(1);
  });

  it('dos verificaciones simultáneas envían una sola vez', async () => {
    const { sender, useCase } = setup();
    await Promise.all([useCase.execute('nueva'), useCase.execute('nueva')]);
    expect(sender.sent).toHaveLength(1);
  });

  it('no envía a las cuentas anteriores a la migración, a las sin verificar ni a las que no existen', async () => {
    const { sender, useCase } = setup();
    await useCase.execute('anterior');
    await useCase.execute('sin-verificar');
    await useCase.execute('no-existe');
    expect(sender.sent).toHaveLength(0);
  });

  it('si el proveedor falla no lanza, avisa sin correo ni nombre y deja la marca puesta', async () => {
    const { welcome, sender, warnings, useCase } = setup();
    sender.failWith = new EmailSendError('Resend respondió 503.');

    await expect(useCase.execute('nueva')).resolves.toBeUndefined();

    expect(warnings).toEqual(['No se pudo enviar el correo de bienvenida: Resend respondió 503..']);
    expect(warnings.join()).not.toContain('ana@correo.com');
    expect(warnings.join()).not.toContain('Ana');
    expect(welcome.accounts.get('nueva')?.welcomeSentAt).toEqual(now);
    // No se reintenta.
    sender.failWith = null;
    await useCase.execute('nueva');
    expect(sender.sent).toHaveLength(0);
  });

  it('un error inesperado también se registra sin detalles', async () => {
    const { welcome, warnings, useCase } = setup();
    welcome.claim = () => Promise.reject(new Error('fallo de ana@correo.com'));
    await expect(useCase.execute('nueva')).resolves.toBeUndefined();
    expect(warnings).toEqual([
      'No se pudo enviar el correo de bienvenida: error inesperado (Error).',
    ]);
  });

  it('el nombre con HTML se escapa en el correo enviado', async () => {
    const { welcome, sender, useCase } = setup();
    const account = welcome.accounts.get('nueva');
    if (account) account.displayName = '<b>Ana</b>';
    await useCase.execute('nueva');
    expect(sender.sent[0]?.html).not.toContain('<b>Ana</b>');
    expect(sender.sent[0]?.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});

describe('sendWelcomeInBackground', () => {
  it('no espera al envío ni propaga su error', async () => {
    const welcome = new RecordingWelcome();
    welcome.failWith = new Error('boom');
    expect(() => {
      sendWelcomeInBackground(welcome, 'nueva');
    }).not.toThrow();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(welcome.requested).toEqual(['nueva']);
  });
});
