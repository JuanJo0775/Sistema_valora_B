import type { NoticeContent } from './moderation-notice-content';

// Un dispositivo suscrito: lo que hace falta para enviarle un aviso (ADR-045).
export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// 'sent': el servicio de push aceptó el mensaje. 'gone': la suscripción ya no existe (404 o 410) y
// hay que borrarla.
export type PushResult = 'sent' | 'gone';

// Puerto hacia el servicio de push (ADR-044). Un fallo pasajero (red, 5xx, 429) lanza
// PushUnavailableError para que el outbox reintente.
export interface PushSender {
  send(device: PushDevice, content: NoticeContent): Promise<PushResult>;
}

// Para reemplazar el envío en las pruebas.
export const PUSH_SENDER = Symbol('PUSH_SENDER');

export class PushUnavailableError extends Error {
  constructor(message = 'El servicio de push no está disponible') {
    super(message);
    this.name = 'PushUnavailableError';
  }
}
