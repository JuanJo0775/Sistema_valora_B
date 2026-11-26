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
    for (const accountId of await moderators.ids()) {
      const last = await log.lastSent(accountId, queue);
      if (last !== null && now.getTime() - last.getTime() < MIN_NOTICE_INTERVAL_MS) continue;
      let sent = false;
      for (const device of await subscriptions.devicesOf(accountId)) {
        if ((await sender.send(device, content)) === 'sent') sent = true;
      }
      if (sent) await log.record(accountId, queue, now);
    }
  }
}
