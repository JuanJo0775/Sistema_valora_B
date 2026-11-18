import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import { CatalogModule, PresentationFreshness, PresentationLabels } from '../catalog';
import { EstablishmentNames, EstablishmentsAround, EstablishmentsModule } from '../establishments';
import { IdentityModule } from '../identity';
import { AssessReportedPrice, type PriceReportedV2 } from './application/assess-reported-price';
import {
  DecideModeration,
  MODERATION_DECIDER,
  type ModerationDecider,
} from './application/decide-moderation';
import { AppealReport } from './application/appeal-report';
import { FlagReport, REPORT_FLAGGER, type ReportFlagger } from './application/flag-report';
import { ModerationQueue } from './application/moderation-queue';
import { MyReports } from './application/my-reports';
import { ReliabilityOfPrices } from './application/reliability-of-prices';
import { ReportStatus } from './application/report-status';
import { FlagsController } from './http/flags.controller';
import { ModerationController } from './http/moderation.controller';
import { MyReportsController } from './http/my-reports.controller';
import { DrizzleModerationStore } from './infrastructure/drizzle-moderation-store';
import { DrizzleObservationStore, DrizzleReputationStore } from './infrastructure/drizzle-stores';

// Grill de la #31, pregunta 7: radio de la zona de referencia (provisional).
const ZONE_RADIUS_METERS = 1000;

@Module({
  imports: [CatalogModule, EstablishmentsModule, IdentityModule],
  controllers: [FlagsController, ModerationController, MyReportsController],
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
      provide: REPORT_FLAGGER,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ReportFlagger => ({
        execute: (request) =>
          db.transaction((tx) =>
            new FlagReport({
              moderation: new DrizzleModerationStore(tx),
              observations: new DrizzleObservationStore(tx),
              events: { publish: (event) => outbox.publish(tx, event) },
              clock: { now: () => new Date() },
            }).execute(request),
          ),
      }),
    },
    {
      provide: AppealReport,
      inject: [DATABASE],
      useFactory: (db: Database): AppealReport =>
        new AppealReport({
          observations: new DrizzleObservationStore(db),
          moderation: new DrizzleModerationStore(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: ReportStatus,
      inject: [DATABASE],
      useFactory: (db: Database): ReportStatus =>
        new ReportStatus({
          observations: new DrizzleObservationStore(db),
          moderation: new DrizzleModerationStore(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MyReports,
      inject: [DATABASE, PresentationLabels, EstablishmentNames],
      useFactory: (
        db: Database,
        labels: PresentationLabels,
        names: EstablishmentNames,
      ): MyReports =>
        new MyReports({
          moderation: new DrizzleModerationStore(db),
          labels,
          names,
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
    {
      provide: MODERATION_DECIDER,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ModerationDecider => ({
        execute: (request) =>
          db.transaction((tx) =>
            new DecideModeration({
              moderation: new DrizzleModerationStore(tx),
              observations: new DrizzleObservationStore(tx),
              reputations: new DrizzleReputationStore(tx),
              events: { publish: (event) => outbox.publish(tx, event) },
              clock: { now: () => new Date() },
            }).execute(request),
          ),
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
    // Grill de la #29, pregunta 3 (RF-012 RN2): pricing avisa una ráfaga y sus reportes van a la cola.
    this.bus.subscribe(
      'reliability.bursts',
      'ReportBurstDetected',
      async (event: DomainEvent, tx: Transaction) => {
        const { reportIds } = event.payload as { reportIds: string[] };
        await new DrizzleModerationStore(tx).markBurst(reportIds);
      },
    );
  }
}
