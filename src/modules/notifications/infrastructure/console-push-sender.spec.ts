import { Logger } from '@nestjs/common';
import { contentOf } from '../application/moderation-notice-content';
import { ConsolePushSender } from './console-push-sender';

const device = {
  endpoint: 'https://push.example.net/dispositivo-secreto',
  p256dh: 'clave-publica-del-dispositivo',
  auth: 'secreto-del-dispositivo',
};

describe('envío de avisos a la consola (PUSH_PROVIDER=console)', () => {
  it('no envía nada: deja una línea en el registro y responde que se envió', async () => {
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      lines.push(String(message));
    });

    const result = await new ConsolePushSender().send(device, contentOf('precios'));

    expect(result).toBe('sent');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('moderacion-precios');
    jest.restoreAllMocks();
  });

  // ADR-045: la dirección del dispositivo y sus claves no se escriben en los registros.
  it('nunca escribe la dirección ni las claves del dispositivo', async () => {
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      lines.push(String(message));
    });

    await new ConsolePushSender().send(device, contentOf('precios'));

    const written = lines.join(' ');
    expect(written).not.toContain(device.endpoint);
    expect(written).not.toContain(device.p256dh);
    expect(written).not.toContain(device.auth);
    jest.restoreAllMocks();
  });
});
