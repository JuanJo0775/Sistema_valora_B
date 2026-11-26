import { contentOf } from '../application/moderation-notice-content';
import { WebPushSender } from './web-push-sender';

const device = {
  endpoint: 'https://push.example.net/dispositivo',
  p256dh: 'clave-publica-del-dispositivo',
  auth: 'secreto-del-dispositivo',
};

interface Call {
  subscription: unknown;
  payload: string;
  options: unknown;
}

describe('envío por Web Push (ADR-044)', () => {
  it('manda el contenido cifrado con la suscripción del dispositivo y responde que se envió', async () => {
    const calls: Call[] = [];
    const sender = new WebPushSender((subscription, payload, options) => {
      calls.push({ subscription, payload, options });
      return Promise.resolve({ statusCode: 201 });
    });

    const result = await sender.send(device, contentOf('precios'));

    expect(result).toBe('sent');
    expect(calls).toEqual([
      {
        subscription: {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        payload: JSON.stringify(contentOf('precios')),
        // Vigencia de una hora y un Topic igual a la etiqueta: el servicio de push también agrupa
        // los avisos pendientes de una cola.
        options: { TTL: 3600, urgency: 'normal', topic: 'moderacion-precios' },
      },
    ]);
  });
});
