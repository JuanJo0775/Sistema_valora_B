import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ComparisonModule, ImportInitialPrices } from './modules/comparison';
import { ImportsModule, RunSeed, SeedInitialPrices } from './modules/imports';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

// pnpm db:seed: carga las filas verificadas de seed/ en la base de DATABASE_URL (issue #51).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    // Desde la #26, catalog depende de identity, que publica eventos.
    EventsModule,
    ImportsModule,
    // B#135: los datos iniciales se guardan en comparison (imports no conoce al núcleo).
    ComparisonModule,
  ],
})
export class SeedModule {}

export type InitialPricesSummary =
  { ok: true; saved: number; kept: number; skipped: number } | { ok: false; errors: string[] };

// B#135: imports prepara los datos iniciales de precios-iniciales.csv (uno por tienda de su cadena)
// y comparison los guarda solo donde la comunidad no ha reportado. Todo o nada si hay un error.
export async function seedInitialPrices(
  initial: Pick<SeedInitialPrices, 'read'>,
  load: Pick<ImportInitialPrices, 'execute'>,
): Promise<InitialPricesSummary> {
  const read = await initial.read();
  if (!read.ok) return read;
  const { saved, kept } = await load.execute(read.prices);
  return { ok: true, saved, kept, skipped: read.skipped };
}

async function seed(): Promise<void> {
  const logger = new Logger('Semilla');
  const context = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await context.get(RunSeed).execute();
    if (!result.ok) {
      logger.error(`No se cargó nada: ${String(result.errors.length)} filas con errores.`);
      for (const error of result.errors) logger.error(error);
      process.exitCode = 1;
      return;
    }
    const { stores, products, references, notInFiles } = result;
    logger.log(
      `Tiendas: ${String(stores.saved)} guardadas, ${String(stores.skipped)} pendientes de revisar.`,
    );
    logger.log(
      `Productos: ${String(products.saved)} guardados (${String(products.presentations)} presentaciones), ${String(products.skipped)} pendientes de verificar.`,
    );
    logger.log(
      `Referencias SIPSA: ${String(references.saved)} guardadas, ${String(references.skipped)} pendientes de verificar.`,
    );
    const initial = await seedInitialPrices(
      context.get(SeedInitialPrices),
      context.get(ImportInitialPrices),
    );
    if (!initial.ok) {
      logger.error(
        `No se cargaron los datos iniciales: ${String(initial.errors.length)} filas con errores.`,
      );
      for (const error of initial.errors) logger.error(error);
      process.exitCode = 1;
      return;
    }
    logger.log(
      `Datos iniciales: ${String(initial.saved)} guardados, ${String(initial.kept)} donde ya había precio de la comunidad, ${String(initial.skipped)} filas pendientes de verificar.`,
    );
    if (notInFiles.stores + notInFiles.products > 0) {
      logger.warn(
        `En la base hay ${String(notInFiles.stores)} tiendas y ${String(notInFiles.products)} productos que ya no están en seed/. No se borraron.`,
      );
    }
  } finally {
    await context.close();
  }
}

// Solo al ejecutarlo como comando; las pruebas importan SeedModule.
if (require.main === module) void seed();
