import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readPresentationsByBarcode } from './modules/catalog';
import {
  applyOlimpica,
  OlimpicaObservations,
  OlimpicaVtex,
  PreviewOlimpica,
  type OnlineObservation,
} from './modules/imports';
import { validateEnv } from './shared/config/env.validation';
import { DATABASE, DatabaseModule, type Database } from './shared/database/database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DatabaseModule],
})
class OlimpicaPilotModule {}

// Punto público fijo del centro de Armenia, en orden longitud y latitud de VTEX.
const ARMENIA_CENTER = [-75.6811, 4.5339] as const;

export async function runOlimpicaPreview(
  args: string[],
  env: NodeJS.ProcessEnv,
  findCatalog: () => Promise<{
    find(ean: string): Promise<string[]>;
    close(): Promise<void>;
    save?: (observation: OnlineObservation) => Promise<OnlineObservation>;
  }>,
  request: typeof fetch = fetch,
) {
  const [option, runOption] = args;
  const apply = option === '--apply';
  const suppliedRunId = runOption?.slice('--run-id='.length);
  if (
    (!apply && args.length > 0) ||
    args.length > 2 ||
    (runOption !== undefined &&
      (!runOption.startsWith('--run-id=') ||
        !suppliedRunId ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(suppliedRunId)))
  ) {
    throw new Error('Usa vista previa o --apply con --run-id=<UUID> opcional.');
  }
  const location = env['OLIMPICA_VTEX_LOCATION']?.trim();
  const atCenter = location === 'armenia-centro';
  const postalCode = env['OLIMPICA_VTEX_POSTAL_CODE']?.trim() ?? '';
  const regionId = env['OLIMPICA_VTEX_REGION_ID']?.trim() ?? '';
  const sellerId = env['OLIMPICA_VTEX_SELLER_ID']?.trim() ?? '';
  const eans = env['OLIMPICA_VTEX_EANS']?.split(',').map((ean) => ean.trim()) ?? [];
  if (
    (location !== undefined && location !== '' && !atCenter) ||
    (!atCenter && (!/^630[0-9]{3}$/.test(postalCode) || !regionId || !sellerId)) ||
    eans.length < 5 ||
    eans.length > 10 ||
    new Set(eans).size !== eans.length ||
    eans.some((ean) => !/^[0-9]{13}$/.test(ean))
  ) {
    throw new Error('Configura una zona de prueba de Armenia, su vendedor y de 5 a 10 EAN únicos.');
  }
  const zone = atCenter
    ? { id: 'armenia-centro', regionId: 'armenia-centro', sellerId: '1' }
    : { id: 'armenia-piloto', regionId, sellerId };
  const catalog = await findCatalog();
  try {
    const save = catalog.save;
    if (apply && !save) throw new Error('El comando solo admite vista previa sin repositorio.');
    const vtex = new OlimpicaVtex(atCenter ? ARMENIA_CENTER : postalCode, request);
    const confirmed = await vtex.confirms(zone);
    const pilot = new PreviewOlimpica({
      findPresentations: (ean) => catalog.find(ean),
      quote: (ean, target) =>
        confirmed
          ? vtex.quote(ean, target)
          : Promise.resolve({ regionId: '', sellerId: '', skuId: '', available: false }),
      now: () => new Date(),
    });
    const preview = await pilot.execute(zone, eans);
    return apply && save
      ? await applyOlimpica(preview, suppliedRunId ?? randomUUID(), save)
      : preview;
  } finally {
    await catalog.close();
  }
}

async function main(): Promise<void> {
  process.loadEnvFile();
  const result = await runOlimpicaPreview(process.argv.slice(2), process.env, async () => {
    const context = await NestFactory.createApplicationContext(OlimpicaPilotModule, {
      logger: false,
      abortOnError: false,
    });
    const db = context.get<Database>(DATABASE);
    const catalog = readPresentationsByBarcode(db);
    const observations = new OlimpicaObservations(db);
    return {
      find: async (ean) => {
        const id = (await catalog.byBarcodes([ean])).get(ean);
        return id === undefined ? [] : [id];
      },
      save: (observation) => observations.save(observation),
      close: () => context.close(),
    };
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falló la vista previa.');
    process.exitCode = 1;
  });
}
