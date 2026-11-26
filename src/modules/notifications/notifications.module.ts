import { Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.validation';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus } from '../../shared/events';
import { AccountsByRole, IdentityModule } from '../identity';
import { PurgeAccountSubscriptions } from './application/purge-account-subscriptions';
import { MODERATION_FACT_TYPES, queueOf } from './application/moderation-notice-rules';
import { NotifyMerchant } from './application/notify-merchant';
import { NotifyModerators } from './application/notify-moderators';
import { PUSH_SENDER, type PushSender } from './application/push-sender';
import { SubscribePush } from './application/subscribe-push';
import { UnsubscribePush } from './application/unsubscribe-push';
import { NotificationsController, VAPID_PUBLIC_KEY } from './http/notifications.controller';
import { createPushSender } from './infrastructure/create-push-sender';
import { DrizzleNoticeLog } from './infrastructure/drizzle-notice-log';
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
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PushSender =>
        createPushSender({
          PUSH_PROVIDER: config.get('PUSH_PROVIDER', { infer: true }),
          VAPID_PUBLIC_KEY: config.get('VAPID_PUBLIC_KEY', { infer: true }),
          VAPID_PRIVATE_KEY: config.get('VAPID_PRIVATE_KEY', { infer: true }),
          VAPID_SUBJECT: config.get('VAPID_SUBJECT', { infer: true }),
        }),
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
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(
    private readonly bus: EventBus,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly accounts: AccountsByRole,
  ) {}

  // ADR-032 con el hallazgo de B7 (#208): al borrar una cuenta, no queda ningún dispositivo suyo. El
  // borrado va en la transacción del suscriptor (ADR-015) y es idempotente.
  onModuleInit(): void {
    // ADR-044: un caso nuevo en la cola de precios avisa a los moderadores. El envío corre en el
    // suscriptor del outbox, después de confirmar la operación original: si falla, el reporte ya está
    // guardado (EC-04) y el outbox reintenta; el límite de 5 minutos evita duplicados.
    for (const type of MODERATION_FACT_TYPES) {
      this.bus.subscribe(
        'notifications.moderator_notices',
        type,
        async (event: DomainEvent, tx: Transaction) => {
          const queue = queueOf(event);
          if (queue === null) return;
          const delivered = await new NotifyModerators({
            moderators: { ids: () => this.accounts.ids('moderador') },
            subscriptions: new DrizzlePushSubscriptions(tx),
            sender: this.sender,
            log: new DrizzleNoticeLog(tx),
            clock: { now: () => new Date() },
          }).execute(queue);
          // Medida del escenario EC-09: solo números (cola, avisos y milisegundos desde el hecho
          // hasta que el servicio de push aceptó el mensaje); nunca datos de nadie.
          if (delivered > 0) {
            const ms = Date.now() - event.occurredAt.getTime();
            this.logger.log(
              `Aviso a moderación: cola=${queue} enviados=${String(delivered)} ms=${String(ms)}`,
            );
          }
        },
      );
    }
    // Fase 3 de #260: el resumen diario de commerce publica MerchantAlertsRaised (solo el id de la
    // cuenta) y el comercio recibe un aviso push, independiente del correo. Vencimientos y
    // discrepancias salen juntos porque commerce ya los calcula en el mismo resumen.
    this.bus.subscribe(
      'notifications.merchant_notices',
      'MerchantAlertsRaised',
      async (event: DomainEvent, tx: Transaction) => {
        const { accountId } = event.payload as { accountId: string };
        const delivered = await new NotifyMerchant({
          merchants: { ids: () => this.accounts.ids('comercio') },
          subscriptions: new DrizzlePushSubscriptions(tx),
          sender: this.sender,
          log: new DrizzleNoticeLog(tx),
          clock: { now: () => new Date() },
        }).execute(accountId);
        if (delivered > 0) {
          const ms = Date.now() - event.occurredAt.getTime();
          this.logger.log(`Aviso a comercio: enviados=${String(delivered)} ms=${String(ms)}`);
        }
      },
    );
    this.bus.subscribe(
      'notifications.push_subscriptions',
      'AccountPurged',
      async (event: DomainEvent, tx: Transaction) => {
        const { accountId } = event.payload as { accountId: string };
        await new PurgeAccountSubscriptions({
          subscriptions: new DrizzlePushSubscriptions(tx),
          notices: new DrizzleNoticeLog(tx),
        }).execute(accountId);
      },
    );
  }
}
