import { contentOf } from './moderation-notice-content';
import type { ModerationQueue } from './moderation-notice-rules';
import type { NoticeLog } from './notice-log';
import type { PushDevice, PushSender } from './push-sender';

export interface NotifyModeratorsPorts {
  // Las cuentas que pueden recibir avisos de moderación (identity, solo ids).
  moderators: { ids(): Promise<string[]> };
  subscriptions: {
    devicesOf(accountId: string): Promise<PushDevice[]>;
    remove(accountId: string, endpoints: string[]): Promise<void>;
  };
  sender: PushSender;
  log: NoticeLog;
  clock: { now(): Date };
}

// ADR-044: como máximo un aviso por cola y por cuenta cada 5 minutos (valor provisional,
// parametrizable); el último queda en el registro de avisos.
export const MIN_NOTICE_INTERVAL_MS = 5 * 60 * 1000;

// ADR-044: avisar a los moderadores cuando entra un caso a una cola.
export class NotifyModerators {
  constructor(private readonly ports: NotifyModeratorsPorts) {}

  async execute(queue: ModerationQueue): Promise<void> {
    const { moderators, subscriptions, sender, log, clock } = this.ports;
    const now = clock.now();
    const content = contentOf(queue);
    // Cuentas a las que no les llegó por un fallo pasajero: se reintenta después de avisar a las demás.
    const failures: unknown[] = [];
    for (const accountId of await moderators.ids()) {
      const last = await log.lastSent(accountId, queue);
      if (last !== null && now.getTime() - last.getTime() < MIN_NOTICE_INTERVAL_MS) continue;
      let sent = false;
      let failure: unknown;
      for (const device of await subscriptions.devicesOf(accountId)) {
        try {
          const result = await sender.send(device, content);
          // ADR-045: la suscripción caducó (404 o 410); no vale la pena guardarla.
          if (result === 'gone') await subscriptions.remove(accountId, [device.endpoint]);
          else sent = true;
        } catch (error) {
          failure ??= error;
        }
      }
      if (sent) await log.record(accountId, queue, now);
      else if (failure !== undefined) failures.push(failure);
    }
    // El outbox reintenta el evento; quien ya recibió el aviso queda fuera por el límite de 5 minutos.
    if (failures.length > 0) throw failures[0];
  }
}
