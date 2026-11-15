import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
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
import { ProposeStore } from './application/propose-store';
import { StoreProposalsQueue } from './application/store-proposals-queue';
import { EstablishmentsController } from './http/establishments.controller';
import { StoreProposalsController } from './http/store-proposals.controller';
import { DrizzleEstablishmentImportRepository } from './infrastructure/drizzle-establishment-import-repository';
import { DrizzleEstablishmentRepository } from './infrastructure/drizzle-establishment-repository';
import { DrizzleStoreProposalRepository } from './infrastructure/drizzle-store-proposal-repository';

@Module({
  imports: [IdentityModule],
  controllers: [EstablishmentsController, StoreProposalsController],
  providers: [
    // Grill de la #27: propuestas de tiendas.
    {
      provide: ProposeStore,
      inject: [DATABASE],
      useFactory: (db: Database): ProposeStore =>
        new ProposeStore({
          proposals: new DrizzleStoreProposalRepository(db),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: StoreProposalsQueue,
      inject: [DATABASE, ESTABLISHMENT_REPOSITORY],
      useFactory: (db: Database, stores: EstablishmentRepository): StoreProposalsQueue =>
        new StoreProposalsQueue({ proposals: new DrizzleStoreProposalRepository(db), stores }),
    },
    {
      provide: DecideStoreProposal,
      inject: [DATABASE, ESTABLISHMENT_REPOSITORY],
      useFactory: (db: Database, stores: EstablishmentRepository): DecideStoreProposal =>
        new DecideStoreProposal({
          proposals: new DrizzleStoreProposalRepository(db),
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
    EstablishmentNames,
    EstablishmentDetails,
    ImportEstablishments,
    EstablishmentExists,
    EstablishmentsWithinRadius,
    EstablishmentsAround,
  ],
})
export class EstablishmentsModule {}
