import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { OutboxPublisher } from '../../shared/events';
import { IdentityModule } from '../identity';
import {
  ESTABLISHMENT_REPOSITORY,
  type EstablishmentRepository,
} from './application/establishment-repository';
import { EstablishmentExists } from './application/establishment-exists';
import { EstablishmentDetails } from './application/establishment-details';
import { EstablishmentNames } from './application/establishment-names';
import { EstablishmentsAround } from './application/establishments-around';
import { EstablishmentsWithinRadius } from './application/establishments-within-radius';
import {
  ESTABLISHMENT_IMPORT_REPOSITORY,
  type EstablishmentImportRepository,
  ImportEstablishments,
} from './application/import-establishments';
import { DecideStoreProposal } from './application/decide-store-proposal';
import { ListNearbyEstablishments } from './application/list-nearby-establishments';
import { PendingStoreProposalName } from './application/pending-store-proposal-name';
import { StoreContactOf } from './application/store-contact-of';
import { DecideStoreCorrection } from './application/decide-store-correction';
import { StoreCorrectionsQueue } from './application/store-corrections-queue';
import { UpdateStoreDetails } from './application/update-store-details';
import { DrizzleStoreCorrectionRepository } from './infrastructure/drizzle-store-correction-repository';
import { ProposalClaims } from './application/proposal-claims';
import { ProposeStore } from './application/propose-store';
import { SearchEstablishments } from './application/search-establishments';
import { StoreProposalsQueue } from './application/store-proposals-queue';
import { StoreProposalsController } from './http/store-proposals.controller';
import { DrizzleEstablishmentImportRepository } from './infrastructure/drizzle-establishment-import-repository';
import { DrizzleEstablishmentRepository } from './infrastructure/drizzle-establishment-repository';
import { DrizzleStoreProposalRepository } from './infrastructure/drizzle-store-proposal-repository';

@Module({
  imports: [IdentityModule],
  // B#131: GET /establishments y /nearby viven en comparison, que suma el conteo de precios.
  controllers: [StoreProposalsController],
  providers: [
    // D5 (#207): datos de la tienda y correcciones.
    {
      provide: UpdateStoreDetails,
      inject: [DATABASE],
      useFactory: (db: Database): UpdateStoreDetails =>
        new UpdateStoreDetails({
          stores: new DrizzleEstablishmentRepository(db),
          corrections: new DrizzleStoreCorrectionRepository(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: StoreCorrectionsQueue,
      inject: [DATABASE],
      useFactory: (db: Database): StoreCorrectionsQueue =>
        new StoreCorrectionsQueue({
          corrections: new DrizzleStoreCorrectionRepository(db),
          stores: new DrizzleEstablishmentRepository(db),
        }),
    },
    {
      provide: DecideStoreCorrection,
      inject: [DATABASE],
      useFactory: (db: Database): DecideStoreCorrection =>
        new DecideStoreCorrection({
          corrections: new DrizzleStoreCorrectionRepository(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: StoreContactOf,
      inject: [DATABASE],
      useFactory: (db: Database): StoreContactOf =>
        new StoreContactOf(new DrizzleEstablishmentRepository(db)),
    },
    {
      provide: PendingStoreProposalName,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): PendingStoreProposalName =>
        new PendingStoreProposalName(new DrizzleStoreProposalRepository(db, outbox)),
    },
    // Grill de la #27: propuestas de tiendas.
    {
      provide: ProposeStore,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ProposeStore =>
        new ProposeStore({
          proposals: new DrizzleStoreProposalRepository(db, outbox),
          clock: { now: () => new Date() },
        }),
    },
    // H5: commerce registra aquí de qué reclamos nacen las propuestas.
    ProposalClaims,
    {
      provide: StoreProposalsQueue,
      inject: [DATABASE, OutboxPublisher, ESTABLISHMENT_REPOSITORY, ProposalClaims],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        stores: EstablishmentRepository,
        claims: ProposalClaims,
      ): StoreProposalsQueue =>
        new StoreProposalsQueue({
          proposals: new DrizzleStoreProposalRepository(db, outbox),
          stores,
          claims,
        }),
    },
    {
      provide: DecideStoreProposal,
      inject: [DATABASE, OutboxPublisher, ESTABLISHMENT_REPOSITORY],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        stores: EstablishmentRepository,
      ): DecideStoreProposal =>
        new DecideStoreProposal({
          proposals: new DrizzleStoreProposalRepository(db, outbox),
          stores,
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: ESTABLISHMENT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): EstablishmentRepository => new DrizzleEstablishmentRepository(db),
    },
    {
      provide: ListNearbyEstablishments,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): ListNearbyEstablishments =>
        new ListNearbyEstablishments(repository),
    },
    {
      provide: SearchEstablishments,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): SearchEstablishments =>
        new SearchEstablishments(repository),
    },
    {
      provide: ESTABLISHMENT_IMPORT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (db: Database): EstablishmentImportRepository =>
        new DrizzleEstablishmentImportRepository(db),
    },
    {
      provide: ImportEstablishments,
      inject: [ESTABLISHMENT_IMPORT_REPOSITORY],
      useFactory: (repository: EstablishmentImportRepository): ImportEstablishments =>
        new ImportEstablishments(repository),
    },
    {
      provide: EstablishmentExists,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentExists =>
        new EstablishmentExists(repository),
    },
    {
      provide: EstablishmentsWithinRadius,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentsWithinRadius =>
        new EstablishmentsWithinRadius(repository),
    },
    {
      provide: EstablishmentsAround,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentsAround =>
        new EstablishmentsAround(repository),
    },
    {
      provide: EstablishmentDetails,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentDetails =>
        new EstablishmentDetails(repository),
    },
    {
      provide: EstablishmentNames,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentNames =>
        new EstablishmentNames(repository),
    },
  ],
  exports: [
    ProposalClaims,
    StoreContactOf,
    UpdateStoreDetails,
    ProposeStore,
    PendingStoreProposalName,
    ListNearbyEstablishments,
    SearchEstablishments,
    EstablishmentNames,
    EstablishmentDetails,
    ImportEstablishments,
    EstablishmentExists,
    EstablishmentsWithinRadius,
    EstablishmentsAround,
  ],
})
export class EstablishmentsModule {}
