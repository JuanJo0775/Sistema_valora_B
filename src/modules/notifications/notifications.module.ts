import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus } from '../../shared/events';
import { IdentityModule } from '../identity';
import { PurgeAccountSubscriptions } from './application/purge-account-subscriptions';
import { SubscribePush } from './application/subscribe-push';
import { UnsubscribePush } from './application/unsubscribe-push';
import { NotificationsController, VAPID_PUBLIC_KEY } from './http/notifications.controller';
import { DrizzlePushSubscriptions } from './infrastructure/drizzle-push-subscriptions';

// Avisos por Web Push a moderadores y comercios (ADR-044, ADR-045). Nadie lo importa: solo AppModule
// lo registra. Por ahora guarda las suscripciones; el envío llega con #260.
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: VAPID_PUBLIC_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): string | undefined =>
        config.get('VAPID_PUBLIC_KEY', { infer: true }),
    },
    {
      provide: SubscribePush,
      inject: [DATABASE],
      useFactory: (db: Database): SubscribePush =>
        new SubscribePush({
          subscriptions: new DrizzlePushSubscriptions(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: UnsubscribePush,
      inject: [DATABASE],
      useFactory: (db: Database): UnsubscribePush =>
        new UnsubscribePush({ subscriptions: new DrizzlePushSubscriptions(db) }),
    },
  ],
})
export class NotificationsModule implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  // ADR-032 con el hallazgo de B7 (#208): al borrar una cuenta, no queda ningún dispositivo suyo. El
  // borrado va en la transacción del suscriptor (ADR-015) y es idempotente.
  onModuleInit(): void {
    this.bus.subscribe(
      'notifications.push_subscriptions',
      'AccountPurged',
      async (event: DomainEvent, tx: Transaction) => {
        const { accountId } = event.payload as { accountId: string };
        await new PurgeAccountSubscriptions({
          subscriptions: new DrizzlePushSubscriptions(tx),
        }).execute(accountId);
      },
    );
  }
}
