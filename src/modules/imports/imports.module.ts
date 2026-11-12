import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { CatalogModule, ImportCatalog } from '../catalog';
import { EstablishmentsModule, ImportEstablishments } from '../establishments';
import { RunSeed } from './application/run-seed';
import { SEED_SOURCE, type SeedSource } from './application/seed-source';
import { CsvSeedSource } from './infrastructure/csv-seed-source';

// Siembra manual (RF-014, ADR-011). No tiene tablas propias: guarda por la interfaz pública de
// catalog y establishments.
@Module({
  imports: [CatalogModule, EstablishmentsModule],
  providers: [
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
  ],
  exports: [RunSeed],
})
export class ImportsModule {}
