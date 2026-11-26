import type { NoticeContent } from './moderation-notice-content';
import type { NoticeLog } from './notice-log';
import type { PushDevice, PushSender } from './push-sender';

export interface DeliveryPorts {
  subscriptions: {
    devicesOf(accountId: string): Promise<PushDevice[]>;
    remove(accountId: string, endpoints: string[]): Promise<void>;
  };
  sender: PushSender;
  log: NoticeLog;
  clock: { now(): Date };
}

// Entrega un aviso a los dispositivos de varias cuentas (ADR-044). `queue` es el nombre con el que se
// lleva la cuenta del límite: como máximo un aviso por cuenta y por `queue` cada `minIntervalMs`.
// Devuelve cuántos avisos se enviaron.
// - Un 404 o 410 del servicio de push borra la suscripción (ADR-045).
// - Un fallo pasajero en una cuenta que no recibió nada hace fallar al final, para que el outbox
//   reintente; quien ya recibió el aviso queda fuera por el límite, así que no se duplica.
export async function deliverNotice(
  ports: DeliveryPorts,
  accountIds: string[],
  queue: string,
  content: NoticeContent,
  minIntervalMs: number,
): Promise<number> {
  const { subscriptions, sender, log, clock } = ports;
  const now = clock.now();
  const failures: unknown[] = [];
  let delivered = 0;
  for (const accountId of accountIds) {
    const last = await log.lastSent(accountId, queue);
    if (last !== null && now.getTime() - last.getTime() < minIntervalMs) continue;
    let sent = false;
    let failure: unknown;
    for (const device of await subscriptions.devicesOf(accountId)) {
      try {
        const result = await sender.send(device, content);
        // ADR-045: la suscripción caducó (404 o 410); no vale la pena guardarla.
        if (result === 'gone') await subscriptions.remove(accountId, [device.endpoint]);
        else {
          sent = true;
          delivered += 1;
        }
      } catch (error) {
        failure ??= error;
      }
    }
    if (sent) await log.record(accountId, queue, now);
    else if (failure !== undefined) failures.push(failure);
  }
  if (failures.length > 0) throw failures[0];
  return delivered;
}
