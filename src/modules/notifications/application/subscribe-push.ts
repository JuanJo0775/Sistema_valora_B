import type { PushSubscriptionRepository } from './push-subscriptions';

export interface SubscribePushPorts {
  subscriptions: PushSubscriptionRepository;
  clock: { now(): Date };
}

export interface SubscribePushCommand {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ADR-045: máximo de dispositivos por cuenta (valor provisional, parametrizable). Al pasarlo se
// reemplaza el más antiguo.
export const MAX_SUBSCRIPTIONS_PER_ACCOUNT = 5;

// ADR-045: activar los avisos en un dispositivo.
export class SubscribePush {
  constructor(private readonly ports: SubscribePushPorts) {}

  async execute(command: SubscribePushCommand): Promise<void> {
    const { subscriptions, clock } = this.ports;
    await subscriptions.save({ ...command, createdAt: clock.now() });
    const endpoints = await subscriptions.endpointsOf(command.accountId);
    const surplus = endpoints.length - MAX_SUBSCRIPTIONS_PER_ACCOUNT;
    if (surplus > 0) await subscriptions.remove(command.accountId, endpoints.slice(0, surplus));
  }
}
