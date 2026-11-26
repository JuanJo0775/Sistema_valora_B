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

// ADR-045: activar los avisos en un dispositivo.
export class SubscribePush {
  constructor(private readonly ports: SubscribePushPorts) {}

  async execute(command: SubscribePushCommand): Promise<void> {
    const { subscriptions, clock } = this.ports;
    await subscriptions.save({ ...command, createdAt: clock.now() });
  }
}
