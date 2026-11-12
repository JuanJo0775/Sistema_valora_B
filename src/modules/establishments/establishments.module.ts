import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import {
  ESTABLISHMENT_REPOSITORY,
  type EstablishmentRepository,
} from './application/establishment-repository';
import { ListNearbyEstablishments } from './application/list-nearby-establishments';
import { EstablishmentsController } from './http/establishments.controller';
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
  ],
})
export class EstablishmentsModule {}
