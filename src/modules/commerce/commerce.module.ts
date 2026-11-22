import { Module, type OnModuleInit } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../shared/database/database.module';
import { type DomainEvent, EventBus, OutboxPublisher } from '../../shared/events';
import {
  EstablishmentDetails,
  EstablishmentsModule,
  PendingStoreProposalName,
  ProposeStore,
} from '../establishments';
import { IdentityModule, ReporterIdentity } from '../identity';
import { ClaimEstablishment } from './application/claim-establishment';
import { ClaimProposedEstablishment } from './application/claim-proposed-establishment';
import { MerchantProfile } from './application/merchant-profile';
import { type ProposalDecision, ResolveProposedClaim } from './application/resolve-proposed-claim';
import { MerchantController } from './http/merchant.controller';
import { DrizzleMerchantClaimRepository } from './infrastructure/drizzle-merchant-claim-repository';

// EPIC-B08: comercios verificados (D1 a D8 del grill comercial). B1 (#201) y B2 (#202): registro y
// perfil.
@Module({
  imports: [IdentityModule, EstablishmentsModule],
  controllers: [MerchantController],
  providers: [
    {
      provide: ClaimEstablishment,
      inject: [DATABASE, EstablishmentDetails, OutboxPublisher],
      useFactory: (
        db: Database,
        establishments: EstablishmentDetails,
        outbox: OutboxPublisher,
      ): ClaimEstablishment =>
        new ClaimEstablishment({
          establishments,
          claims: new DrizzleMerchantClaimRepository(db, outbox),
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
  }
}
