import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import { CatalogModule, PresentationFreshness, PresentationLabels } from '../catalog';
import { EstablishmentNames, EstablishmentsAround, EstablishmentsModule } from '../establishments';
import { IdentityModule } from '../identity';
import { AssessReportedPrice, type PriceReportedV2 } from './application/assess-reported-price';
import { FlagReport } from './application/flag-report';
import { ModerationQueue } from './application/moderation-queue';
import { ReliabilityOfPrices } from './application/reliability-of-prices';
import { FlagsController } from './http/flags.controller';
import { ModerationController } from './http/moderation.controller';
import { DrizzleModerationStore } from './infrastructure/drizzle-moderation-store';
import { DrizzleObservationStore, DrizzleReputationStore } from './infrastructure/drizzle-stores';

// Grill de la #31, pregunta 7: radio de la zona de referencia (provisional).
const ZONE_RADIUS_METERS = 1000;

@Module({
  imports: [CatalogModule, EstablishmentsModule, IdentityModule],
  controllers: [FlagsController, ModerationController],
  providers: [
    {
      provide: ReliabilityOfPrices,
      inject: [DATABASE],
      useFactory: (db: Database): ReliabilityOfPrices =>
        new ReliabilityOfPrices({
          observations: new DrizzleObservationStore(db),
          reputations: new DrizzleReputationStore(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: FlagReport,
      inject: [DATABASE],
      useFactory: (db: Database): FlagReport =>
        new FlagReport({
          moderation: new DrizzleModerationStore(db),
          observations: new DrizzleObservationStore(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: ModerationQueue,
      inject: [DATABASE, PresentationLabels, EstablishmentNames],
      useFactory: (
        db: Database,
        labels: PresentationLabels,
        names: EstablishmentNames,
      ): ModerationQueue =>
        new ModerationQueue({ moderation: new DrizzleModerationStore(db), labels, names }),
    },
  ],
  exports: [ReliabilityOfPrices],
})
export class ReliabilityModule implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly outbox: OutboxPublisher,
    private readonly around: EstablishmentsAround,
    private readonly freshness: PresentationFreshness,
  ) {}

  // Grill de la #31, pregunta 4: pricing → reliability → comparison. Todo en la transacción del
  // suscriptor: la observación, la reputación y PriceAssessed se confirman juntos.
  onModuleInit(): void {
    this.bus.subscribe(
      'reliability.observations',
      'PriceReported',
      async (event: DomainEvent, tx: Transaction) => {
        // Los PriceReported v1 (antes de la #31) no traen la clave del reportante: no se evalúan.
        if (event.version < 2) return;
        await new AssessReportedPrice({
          observations: new DrizzleObservationStore(tx),
          reputations: new DrizzleReputationStore(tx),
          zone: {
            around: (establishmentId) =>
              this.around.find({ establishmentId, radiusMeters: ZONE_RADIUS_METERS }),
          },
          freshness: this.freshness,
          events: { publish: (assessed) => this.outbox.publish(tx, assessed) },
        }).execute(event.payload as unknown as PriceReportedV2);
      },
    );
  }
}
