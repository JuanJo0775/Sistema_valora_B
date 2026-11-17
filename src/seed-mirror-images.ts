import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CatalogModule, MirrorProductImages, mirrorSummary } from './modules/catalog';
import { validateEnv } from './shared/config/env.validation';
import { DatabaseModule } from './shared/database/database.module';
import { EventsModule } from './shared/events';

// pnpm seed:espejo-fotos (ADR-022, actualización): copia al bucket público de Supabase las fotos de
// Open Food Facts que la semilla enlazó por URL externa. Corre contra la base de DATABASE_URL (la de
// producción desde el workflow Despliegue, con «copiar_fotos»). Es idempotente.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    // catalog depende de identity, que publica eventos.
    EventsModule,
    CatalogModule,
  ],
})
export class MirrorImagesModule {}

async function mirror(): Promise<void> {
  const logger = new Logger('EspejoFotos');
  // Sin Supabase el comando no tiene a dónde copiar: no usa la carpeta local ni toca la base.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    logger.error(
      'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno: no se copió ninguna foto.',
    );
    process.exitCode = 1;
    return;
  }
  const context = await NestFactory.createApplicationContext(MirrorImagesModule, {
    logger: ['error', 'warn'],
  });
  try {
    const report = await context.get(MirrorProductImages).execute();
    for (const line of mirrorSummary(report)) logger.log(line);
    // Las fallidas conservan su URL original y siguen sirviendo: no detienen el despliegue. Se
    // repite el comando para completarlas.
    if (report.failed > 0) logger.warn('Algunas fotos no se copiaron: repetir el comando.');
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Error desconocido.');
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

if (require.main === module) void mirror();
