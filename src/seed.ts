import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ImportsModule, RunSeed } from './modules/imports';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';

// pnpm db:seed: carga las filas verificadas de seed/ en la base de DATABASE_URL (issue #51).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    ImportsModule,
  ],
})
class SeedModule {}

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
    if (notInFiles.stores + notInFiles.products > 0) {
      logger.warn(
        `En la base hay ${String(notInFiles.stores)} tiendas y ${String(notInFiles.products)} productos que ya no están en seed/. No se borraron.`,
      );
    }
  } finally {
    await context.close();
  }
}

void seed();
