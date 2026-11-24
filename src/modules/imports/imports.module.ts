import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { CatalogModule, ImportCatalog, ProductForComparison } from '../catalog';
import { EstablishmentsModule, ImportEstablishments } from '../establishments';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { ListOnlineOffers, ONLINE_OFFERS_ENABLED } from './application/list-online-offers';
import { OnlineOffersController } from './http/online-offers.controller';
import { OlimpicaObservations } from './infrastructure/olimpica-observations';
import { AccuracySample } from './application/accuracy-sample';
import { SeedInitialPrices } from './application/initial-prices';
import { RunSeed } from './application/run-seed';
import { SEED_SOURCE, type SeedSource } from './application/seed-source';
import { CsvSeedSource } from './infrastructure/csv-seed-source';

// Siembra manual (RF-014, ADR-011). No tiene tablas propias: guarda por la interfaz pública de
// catalog y establishments.
@Module({
  imports: [CatalogModule, EstablishmentsModule],
  controllers: [OnlineOffersController],
  providers: [
    // El piloto se valida con datos sintéticos. La publicación todavía está deshabilitada.
    { provide: ONLINE_OFFERS_ENABLED, useValue: () => false },
    {
      provide: ListOnlineOffers,
      inject: [ProductForComparison, DATABASE, ONLINE_OFFERS_ENABLED],
      useFactory: (catalog: ProductForComparison, db: Database, enabled: () => boolean) =>
        new ListOnlineOffers(catalog, new OlimpicaObservations(db), enabled),
    },
    {
      provide: SEED_SOURCE,
      useFactory: (): SeedSource => new CsvSeedSource(join(process.cwd(), 'seed')),
    },
    {
      provide: RunSeed,
      inject: [SEED_SOURCE, ImportCatalog, ImportEstablishments],
      useFactory: (
        source: SeedSource,
        catalog: ImportCatalog,
        stores: ImportEstablishments,
      ): RunSeed => new RunSeed(source, catalog, stores),
    },
    // PR-22 (#93): la muestra de exactitud del equipo.
    {
      provide: SeedInitialPrices,
      inject: [SEED_SOURCE],
      useFactory: (source: SeedSource): SeedInitialPrices => new SeedInitialPrices(source),
    },
    {
      provide: AccuracySample,
      inject: [SEED_SOURCE],
      useFactory: (source: SeedSource): AccuracySample => new AccuracySample(source),
    },
  ],
  exports: [RunSeed, AccuracySample, SeedInitialPrices],
})
export class ImportsModule {}
