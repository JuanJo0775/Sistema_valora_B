import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import {
  CatalogModule,
  PresentationFreshness,
  PresentationLabels,
  PresentationsForPricing,
} from '../catalog';
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
import { DrizzleOfficialReviewStore } from './infrastructure/drizzle-official-review-store';
import { DrizzleObservationStore, DrizzleReputationStore } from './infrastructure/drizzle-stores';

// Datos de OfficialPriceHeld versión 1 (commerce, ADR-037).
interface OfficialPriceHeldV1 {
  reviewId: string;
  establishmentId: string;
  presentationId: string;
  priceCop: number;
  submittedAt: string;
  reporterKey: string;
}

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
      inject: [DATABASE, PresentationsForPricing, EstablishmentNames],
      useFactory: (
        db: Database,
        presentations: PresentationsForPricing,
        names: EstablishmentNames,
      ): MyReports =>
        new MyReports({
          moderation: new DrizzleModerationStore(db),
          presentations,
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
        new ModerationQueue({
          moderation: new DrizzleModerationStore(db),
          officialReviews: new DrizzleOfficialReviewStore(db),
          labels,
          names,
        }),
    },
    {
      provide: MODERATION_DECIDER,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ModerationDecider => ({
        execute: (request) =>
          db.transaction((tx) =>
            new DecideModeration({
              moderation: new DrizzleModerationStore(tx),
              officialReviews: new DrizzleOfficialReviewStore(tx),
              observations: new DrizzleObservationStore(tx),
              reputations: new DrizzleReputationStore(tx),
              events: { publish: (event) => outbox.publish(tx, event) },
              clock: { now: () => new Date() },
            }).execute(request),
          ),
      }),
    },
  ],
  exports: [ReliabilityOfPrices, ModerationQueue],
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
    // ADR-037: commerce avisa un precio oficial sin referencia; entra a la cola de moderación. Solo se
    // conoce el nombre de los eventos de commerce, no su código (EC-05).
    this.bus.subscribe(
      'reliability.official_reviews',
      'OfficialPriceHeld',
      async (event: DomainEvent, tx: Transaction) => {
        const held = event.payload as unknown as OfficialPriceHeldV1;
        await new DrizzleOfficialReviewStore(tx).save({
          reviewId: held.reviewId,
          presentationId: held.presentationId,
          establishmentId: held.establishmentId,
          reporterKey: held.reporterKey,
          priceCop: held.priceCop,
          receivedAt: new Date(held.submittedAt),
        });
      },
    );
    // ADR-037: otro precio lo reemplazó o se retiró la tienda: sale de la cola.
    this.bus.subscribe(
      'reliability.official_reviews_closed',
      'OfficialPriceReviewClosed',
      async (event: DomainEvent, tx: Transaction) => {
        const { reviewId } = event.payload as { reviewId: string };
        await new DrizzleOfficialReviewStore(tx).close(reviewId);
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
