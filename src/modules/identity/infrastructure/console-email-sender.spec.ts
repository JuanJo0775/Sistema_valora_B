import { ConsoleEmailSender } from './console-email-sender';

const message = {
  to: 'ana@correo.com',
  subject: 'Verifica tu correo en Valora',
  text: 'Abre https://valora.example/verificar-correo?token=abc',
};

describe('correo en consola (ADR-029)', () => {
  it('fuera de producción muestra el asunto y el enlace', async () => {
    const lines: string[] = [];

    await new ConsoleEmailSender({ production: false, log: (line) => lines.push(line) }).send(
      message,
    );

    expect(lines.join('\n')).toContain(message.subject);
    expect(lines.join('\n')).toContain('verificar-correo?token=abc');
  });

  it('en producción no escribe el enlace ni el destinatario en el registro', async () => {
    const lines: string[] = [];

    await new ConsoleEmailSender({ production: true, log: (line) => lines.push(line) }).send(
      message,
    );

    const written = lines.join('\n');
    expect(written).not.toContain('token=abc');
    expect(written).not.toContain('ana@correo.com');
    expect(written).toContain('EMAIL_PROVIDER');
  });
});
