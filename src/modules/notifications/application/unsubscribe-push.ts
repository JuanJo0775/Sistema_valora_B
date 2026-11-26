import type { PushSubscriptionRepository } from './push-subscriptions';

export interface UnsubscribePushPorts {
  subscriptions: Pick<PushSubscriptionRepository, 'remove'>;
}

export interface UnsubscribePushCommand {
  accountId: string;
  endpoint: string;
}

// ADR-045: desactivar los avisos en un dispositivo. Idempotente: borrar lo que no existe no hace nada.
export class UnsubscribePush {
  constructor(private readonly ports: UnsubscribePushPorts) {}

  async execute({ accountId, endpoint }: UnsubscribePushCommand): Promise<void> {
    await this.ports.subscriptions.remove(accountId, [endpoint]);
  }
}
