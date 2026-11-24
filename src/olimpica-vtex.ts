import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readPresentationsByBarcode } from './modules/catalog';
import { OlimpicaVtex, PreviewOlimpica } from './modules/imports';
import { validateEnv } from './shared/config/env.validation';
import { DATABASE, DatabaseModule, type Database } from './shared/database/database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DatabaseModule],
})
class OlimpicaPilotModule {}

export async function runOlimpicaPreview(
  args: string[],
  env: NodeJS.ProcessEnv,
  findCatalog: () => Promise<{ find(ean: string): Promise<string[]>; close(): Promise<void> }>,
  request: typeof fetch = fetch,
) {
  if (args.length > 0) throw new Error('El piloto solo admite vista previa.');
  const postalCode = env['OLIMPICA_VTEX_POSTAL_CODE']?.trim() ?? '';
  const regionId = env['OLIMPICA_VTEX_REGION_ID']?.trim() ?? '';
  const sellerId = env['OLIMPICA_VTEX_SELLER_ID']?.trim() ?? '';
  const eans = env['OLIMPICA_VTEX_EANS']?.split(',').map((ean) => ean.trim()) ?? [];
  if (
    !/^630[0-9]{3}$/.test(postalCode) ||
    !regionId ||
    !sellerId ||
    eans.length < 5 ||
    eans.length > 10 ||
    new Set(eans).size !== eans.length ||
    eans.some((ean) => !/^[0-9]{13}$/.test(ean))
  ) {
    throw new Error('Configura una zona de prueba de Armenia, su vendedor y de 5 a 10 EAN únicos.');
  }
  const zone = { id: 'armenia-piloto', regionId, sellerId };
  const catalog = await findCatalog();
  try {
    const vtex = new OlimpicaVtex(postalCode, request);
    const confirmed = await vtex.confirms(zone);
    const pilot = new PreviewOlimpica({
      findPresentations: (ean) => catalog.find(ean),
      quote: (ean, target) =>
        confirmed
          ? vtex.quote(ean, target)
          : Promise.resolve({ regionId: '', sellerId: '', skuId: '', available: false }),
      now: () => new Date(),
    });
    return await pilot.execute(zone, eans);
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
    const catalog = readPresentationsByBarcode(context.get<Database>(DATABASE));
    return {
      find: async (ean) => {
        const id = (await catalog.byBarcodes([ean])).get(ean);
        return id === undefined ? [] : [id];
      },
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
