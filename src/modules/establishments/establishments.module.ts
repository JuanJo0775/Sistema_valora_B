import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import {
  ESTABLISHMENT_REPOSITORY,
  type EstablishmentRepository,
} from './application/establishment-repository';
import { EstablishmentExists } from './application/establishment-exists';
import { EstablishmentNames } from './application/establishment-names';
import { EstablishmentsAround } from './application/establishments-around';
import { EstablishmentsWithinRadius } from './application/establishments-within-radius';
import {
  ESTABLISHMENT_IMPORT_REPOSITORY,
  type EstablishmentImportRepository,
  ImportEstablishments,
} from './application/import-establishments';
import { ListNearbyEstablishments } from './application/list-nearby-establishments';
import { EstablishmentsController } from './http/establishments.controller';
import { DrizzleEstablishmentImportRepository } from './infrastructure/drizzle-establishment-import-repository';
import { DrizzleEstablishmentRepository } from './infrastructure/drizzle-establishment-repository';

@Module({
  controllers: [EstablishmentsController],
  providers: [
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
      provide: EstablishmentNames,
      inject: [ESTABLISHMENT_REPOSITORY],
      useFactory: (repository: EstablishmentRepository): EstablishmentNames =>
        new EstablishmentNames(repository),
    },
  ],
  exports: [
    EstablishmentNames,
    ImportEstablishments,
    EstablishmentExists,
    EstablishmentsWithinRadius,
    EstablishmentsAround,
  ],
})
export class EstablishmentsModule {}
