import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import { CatalogModule, PresentationFreshness } from '../catalog';
import { EstablishmentsAround, EstablishmentsModule } from '../establishments';
import { AssessReportedPrice, type PriceReportedV2 } from './application/assess-reported-price';
import { ReliabilityOfPrices } from './application/reliability-of-prices';
import { DrizzleObservationStore, DrizzleReputationStore } from './infrastructure/drizzle-stores';

// Grill de la #31, pregunta 7: radio de la zona de referencia (provisional).
const ZONE_RADIUS_METERS = 1000;

@Module({
  imports: [CatalogModule, EstablishmentsModule],
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
