import type { NoticeContent } from '../application/moderation-notice-content';
import {
  type PushDevice,
  type PushResult,
  type PushSender,
  PushUnavailableError,
} from '../application/push-sender';

// Lo que usamos de la función `sendNotification` de la librería web-push; se inyecta para probarlo.
export type SendNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { TTL: number; urgency: 'normal'; topic: string },
) => Promise<{ statusCode: number }>;

// ADR-044: un mensaje que el dispositivo no recibe en una hora ya no sirve, porque es un aviso de
// que hay casos por revisar.
const TTL_SECONDS = 60 * 60;

// El código HTTP con que respondió el servicio de push, si el error lo trae.
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

export class WebPushSender implements PushSender {
  constructor(private readonly sendNotification: SendNotification) {}

  async send(device: PushDevice, content: NoticeContent): Promise<PushResult> {
    try {
      await this.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(content),
        { TTL: TTL_SECONDS, urgency: 'normal', topic: content.tag },
      );
      return 'sent';
    } catch (error) {
      // ADR-045: 404 y 410 son la respuesta del servicio de push a una suscripción que ya no existe.
      const status = statusOf(error);
      if (status === 404 || status === 410) return 'gone';
      // Solo el código HTTP: el mensaje de la librería puede traer la dirección del dispositivo.
      throw new PushUnavailableError(
        status === undefined
          ? 'No se pudo contactar al servicio de push'
          : `El servicio de push respondió ${String(status)}`,
      );
    }
  }
}
