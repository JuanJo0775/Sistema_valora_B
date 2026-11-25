import { randomUUID } from 'node:crypto';
import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import {
  EstablishmentDetails,
  EstablishmentsModule,
  PendingStoreProposalName,
  ProposeStore,
  UpdateStoreDetails,
} from '../establishments';
import {
  CatalogModule,
  PresentationExists,
  PresentationFreshness,
  PresentationLabels,
  PresentationNames,
  PresentationsByBarcode,
} from '../catalog';
import { ComparisonModule, OfficialDiscrepancies } from '../comparison';
import { IdentityModule, NotifyAccount, ReporterIdentity } from '../identity';
import { GatherPlausibilityContext, PricingModule } from '../pricing';
import { ApplyOfficialPriceReview } from './application/apply-official-price-review';
import type { OfficialPriceReviewedV1 } from './application/apply-official-price-review';
import type { PriceReference } from './application/publish-official-price';
import { ClaimEstablishment } from './application/claim-establishment';
import { ClaimProposedEstablishment } from './application/claim-proposed-establishment';
import { CreatePromotion } from './application/create-promotion';
import { DecideMerchantCase } from './application/decide-merchant-case';
import { DeleteMyEstablishment } from './application/delete-my-establishment';
import { LeaveEstablishment } from './application/leave-establishment';
import type { MerchantDeparturePorts } from './application/merchant-departures';
import { MerchantAlerts } from './application/merchant-alerts';
import { MerchantCasesQueue } from './application/merchant-cases-queue';
import { SendMerchantDigests } from './application/send-merchant-digests';
import { PurgeMerchantAccount } from './application/purge-merchant-account';
import { ReportMerchant } from './application/report-merchant';
import { MerchantOfficialPrices } from './application/merchant-official-prices';
import { MerchantProfile } from './application/merchant-profile';
import { MerchantPromotions } from './application/merchant-promotions';
import { PublishOfficialPrice } from './application/publish-official-price';
import { ReconfirmOfficialPrices } from './application/reconfirm-official-prices';
import { UpdateMyEstablishment } from './application/update-my-establishment';
import { UploadOfficialPrices } from './application/upload-official-prices';
import { WithdrawPromotion } from './application/withdraw-promotion';
import { type ProposalDecision, ResolveProposedClaim } from './application/resolve-proposed-claim';
import { AlertsController } from './http/alerts.controller';
import { EstablishmentController } from './http/establishment.controller';
import { DrizzleMerchantNotices } from './infrastructure/drizzle-merchant-notices';
import { MerchantDigestScheduler } from './infrastructure/merchant-digest-scheduler';
import { MerchantCasesController } from './http/merchant-cases.controller';
import { DrizzleMerchantClaimReviews } from './infrastructure/drizzle-merchant-claim-reviews';
import { DrizzleMerchantDepartures } from './infrastructure/drizzle-merchant-departures';
import { DrizzleMerchantRevocations } from './infrastructure/drizzle-merchant-revocations';
import { MerchantController } from './http/merchant.controller';
import { OfficialPricesController } from './http/official-prices.controller';
import { PromotionsController } from './http/promotions.controller';
import { DrizzlePromotionRepository } from './infrastructure/drizzle-promotion-repository';
import { DrizzleOfficialPriceRepository } from './infrastructure/drizzle-official-price-repository';
import { DrizzleMerchantCaseRepository } from './infrastructure/drizzle-merchant-case-repository';
import { DrizzleMerchantClaimRepository } from './infrastructure/drizzle-merchant-claim-repository';

// ADR-037: la referencia de ADR-030 (otras tiendas del municipio y SIPSA) para el precio normal.
const referenceOf = (plausibility: GatherPlausibilityContext): PriceReference => ({
  of: ({ presentationId, establishmentId }) =>
    plausibility.of({ presentationId, establishmentId, priceType: 'normal' }),
});

// La clave seudónima de la cuenta (EC-08).
const reportersOf = (identities: ReporterIdentity) => ({
  keyOf: async (accountId: string): Promise<string> => (await identities.of(accountId)).reporterKey,
});

// H36 (ADR-040): lo que necesitan dejar la tienda y eliminarla.
const departurePortsOf = (db: Database, outbox: OutboxPublisher): MerchantDeparturePorts => ({
  claims: new DrizzleMerchantClaimRepository(db, outbox),
  prices: new DrizzleOfficialPriceRepository(db, outbox),
  promotions: new DrizzlePromotionRepository(db, outbox),
  departures: new DrizzleMerchantDepartures(db, outbox),
  clock: { now: () => new Date() },
});

// EPIC-B08: comercios verificados (D1 a D8 del grill comercial). B1 (#201) y B2 (#202): registro y
// perfil. B3 (#203): precios oficiales.
@Module({
  imports: [IdentityModule, EstablishmentsModule, CatalogModule, ComparisonModule, PricingModule],
  controllers: [
    MerchantController,
    OfficialPricesController,
    PromotionsController,
    EstablishmentController,
    MerchantCasesController,
    AlertsController,
  ],
  providers: [
    {
      provide: PublishOfficialPrice,
      inject: [
        DATABASE,
        OutboxPublisher,
        PresentationExists,
        GatherPlausibilityContext,
        ReporterIdentity,
      ],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationExists,
        plausibility: GatherPlausibilityContext,
        identities: ReporterIdentity,
      ): PublishOfficialPrice =>
        new PublishOfficialPrice({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          presentations,
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          reference: referenceOf(plausibility),
          reporters: reportersOf(identities),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantOfficialPrices,
      inject: [DATABASE, OutboxPublisher, PresentationFreshness, PresentationNames],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationFreshness,
        names: PresentationNames,
      ): MerchantOfficialPrices =>
        new MerchantOfficialPrices({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          presentations,
          names: { namesOf: (ids) => names.of(ids) },
          clock: { now: () => new Date() },
        }),
    },
    // D5 (#207): datos de la tienda, por la interfaz pública de establishments (ADR-001), con la clave
    // seudónima de quien los pide (EC-08).
    {
      provide: UpdateMyEstablishment,
      inject: [DATABASE, OutboxPublisher, UpdateStoreDetails, ReporterIdentity],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        updateStoreDetails: UpdateStoreDetails,
        identities: ReporterIdentity,
      ): UpdateMyEstablishment =>
        new UpdateMyEstablishment({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          stores: {
            update: async (establishmentId, accountId, change) => {
              const { reporterKey } = await identities.of(accountId);
              return updateStoreDetails.execute({
                establishmentId,
                ...change,
                proposerKey: reporterKey,
              });
            },
          },
        }),
    },
    // B9 (#209): avisos del comercio y su resumen diario por correo.
    {
      provide: MerchantAlerts,
      inject: [
        DATABASE,
        OutboxPublisher,
        PresentationFreshness,
        PresentationLabels,
        OfficialDiscrepancies,
      ],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationFreshness,
        labels: PresentationLabels,
        discrepancies: OfficialDiscrepancies,
      ): MerchantAlerts =>
        new MerchantAlerts({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          presentations,
          labels: { labelsOf: (ids) => labels.of(ids) },
          discrepancies,
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: SendMerchantDigests,
      inject: [DATABASE, MerchantAlerts, NotifyAccount],
      useFactory: (
        db: Database,
        alerts: MerchantAlerts,
        notify: NotifyAccount,
      ): SendMerchantDigests => {
        const notices = new DrizzleMerchantNotices(db);
        return new SendMerchantDigests({
          merchants: notices,
          alerts,
          notices,
          notify,
          clock: { now: () => new Date() },
        });
      },
    },
    MerchantDigestScheduler,
    // D2 y D3 (#208): denuncias, disputas y revocación.
    {
      provide: ReportMerchant,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ReportMerchant =>
        new ReportMerchant({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          cases: new DrizzleMerchantCaseRepository(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantCasesQueue,
      inject: [DATABASE, OutboxPublisher, EstablishmentDetails],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        establishments: EstablishmentDetails,
      ): MerchantCasesQueue =>
        new MerchantCasesQueue({
          cases: new DrizzleMerchantCaseRepository(db),
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          establishments,
        }),
    },
    {
      provide: DecideMerchantCase,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): DecideMerchantCase =>
        new DecideMerchantCase({
          cases: new DrizzleMerchantCaseRepository(db),
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          promotions: new DrizzlePromotionRepository(db, outbox),
          revocations: new DrizzleMerchantRevocations(db, outbox),
          claimReviews: new DrizzleMerchantClaimReviews(db, outbox),
          clock: { now: () => new Date() },
        }),
    },
    // H36 (ADR-040): dejar de administrar la tienda y eliminar la tienda propia.
    {
      provide: LeaveEstablishment,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): LeaveEstablishment =>
        new LeaveEstablishment(departurePortsOf(db, outbox)),
    },
    {
      provide: DeleteMyEstablishment,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): DeleteMyEstablishment =>
        new DeleteMyEstablishment(departurePortsOf(db, outbox)),
    },
    // D6 (#206): promociones.
    {
      provide: CreatePromotion,
      inject: [
        DATABASE,
        OutboxPublisher,
        PresentationFreshness,
        PresentationNames,
        GatherPlausibilityContext,
      ],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationFreshness,
        names: PresentationNames,
        plausibility: GatherPlausibilityContext,
      ): CreatePromotion =>
        new CreatePromotion({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          presentations,
          promotions: new DrizzlePromotionRepository(db, outbox),
          names: { namesOf: (ids) => names.of(ids) },
          reference: referenceOf(plausibility),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantPromotions,
      inject: [DATABASE, OutboxPublisher, PresentationFreshness, PresentationNames],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationFreshness,
        names: PresentationNames,
      ): MerchantPromotions =>
        new MerchantPromotions({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          promotions: new DrizzlePromotionRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          presentations,
          names: { namesOf: (ids) => names.of(ids) },
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: WithdrawPromotion,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): WithdrawPromotion =>
        new WithdrawPromotion({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          promotions: new DrizzlePromotionRepository(db, outbox),
        }),
    },
    // D7 (#205): carga por archivo.
    {
      provide: UploadOfficialPrices,
      inject: [
        DATABASE,
        OutboxPublisher,
        PresentationsByBarcode,
        GatherPlausibilityContext,
        ReporterIdentity,
      ],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        presentations: PresentationsByBarcode,
        plausibility: GatherPlausibilityContext,
        identities: ReporterIdentity,
      ): UploadOfficialPrices =>
        new UploadOfficialPrices({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          presentations,
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          reference: referenceOf(plausibility),
          reporters: reportersOf(identities),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: ReconfirmOfficialPrices,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ReconfirmOfficialPrices =>
        new ReconfirmOfficialPrices({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          prices: new DrizzleOfficialPriceRepository(db, outbox),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: ClaimEstablishment,
      inject: [DATABASE, EstablishmentDetails, OutboxPublisher, ReporterIdentity],
      useFactory: (
        db: Database,
        establishments: EstablishmentDetails,
        outbox: OutboxPublisher,
        identities: ReporterIdentity,
      ): ClaimEstablishment =>
        new ClaimEstablishment({
          establishments,
          // H11: la clave seudónima de quien reclama es la que lleva el caso de reclamo (EC-08).
          reporters: { keyOf: async (accountId) => (await identities.of(accountId)).reporterKey },
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          // Precisión de D3 (#208): una disputa por cuenta y tienda mientras esté abierta, con la
          // clave seudónima de quien la abre (EC-08).
          disputes: {
            open: async (establishmentId, accountId) => {
              const cases = new DrizzleMerchantCaseRepository(db);
              const { reporterKey } = await identities.of(accountId);
              if (await cases.hasOpen(establishmentId, reporterKey)) return;
              await cases.open({
                id: randomUUID(),
                establishmentId,
                kind: 'disputa',
                reporterKey,
                reason: 'Otra cuenta, estando en la tienda, intentó registrarla.',
                createdAt: new Date(),
              });
            },
          },
          clock: { now: () => new Date() },
        }),
    },
    // D2: la tienda que no está en el mapa entra a la cola de propuestas de establishments con la
    // clave seudónima de quien la propone, como cualquier propuesta (EC-08).
    {
      provide: ClaimProposedEstablishment,
      inject: [DATABASE, OutboxPublisher, ProposeStore, ReporterIdentity],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        proposeStore: ProposeStore,
        identities: ReporterIdentity,
      ): ClaimProposedEstablishment =>
        new ClaimProposedEstablishment({
          proposals: {
            propose: async (store, accountId) => {
              const { reporterKey } = await identities.of(accountId);
              const { id } = await proposeStore.execute({ ...store, proposerKey: reporterKey });
              return id;
            },
          },
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantProfile,
      inject: [DATABASE, OutboxPublisher, EstablishmentDetails, PendingStoreProposalName],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        establishments: EstablishmentDetails,
        proposals: PendingStoreProposalName,
      ): MerchantProfile =>
        new MerchantProfile({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          // La tienda del mapa o, si el comercio está pre-aprobado, su tienda propuesta.
          establishments: {
            find: async (id) => {
              const store = await establishments.find(id);
              if (store) return store;
              const name = await proposals.find(id);
              return name === null ? null : { name };
            },
          },
        }),
    },
  ],
})
export class CommerceModule implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly outbox: OutboxPublisher,
  ) {}

  // D2: al decidirse la tienda propuesta, el comercio pre-aprobado se resuelve solo. Solo se conoce
  // el nombre del evento de establishments; el cambio va en la transacción del suscriptor (ADR-015).
  onModuleInit(): void {
    this.bus.subscribe(
      'commerce.merchant_claims',
      'StoreProposalDecided',
      async (event: DomainEvent, tx: Transaction) => {
        await new ResolveProposedClaim({
          claims: new DrizzleMerchantClaimRepository(tx, this.outbox),
          clock: { now: () => new Date() },
        }).execute(event.payload as unknown as ProposalDecision);
      },
    );
    // ADR-037: moderación decidió un precio oficial que estaba en revisión.
    this.bus.subscribe(
      'commerce.official_price_reviews',
      'OfficialPriceReviewed',
      async (event: DomainEvent, tx: Transaction) => {
        await new ApplyOfficialPriceReview({
          prices: new DrizzleOfficialPriceRepository(tx, this.outbox),
          clock: { now: () => new Date() },
        }).execute(event.payload as unknown as OfficialPriceReviewedV1);
      },
    );
    // ADR-032 con el hallazgo de B7 (#208): al borrar una cuenta, nada de ella queda en commerce.
    this.bus.subscribe(
      'commerce.merchant_claims',
      'AccountPurged',
      async (event: DomainEvent, tx: Transaction) => {
        const { accountId } = event.payload as { accountId: string };
        await new PurgeMerchantAccount({
          claims: new DrizzleMerchantClaimRepository(tx, this.outbox),
          prices: new DrizzleOfficialPriceRepository(tx, this.outbox),
          promotions: new DrizzlePromotionRepository(tx, this.outbox),
          purges: new DrizzleMerchantRevocations(tx, this.outbox),
        }).execute(accountId);
      },
    );
  }
}
