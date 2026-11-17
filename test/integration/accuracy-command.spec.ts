import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccuracyModule, accuracyReport } from '../../src/accuracy';
import { CurrentPriceOf } from '../../src/modules/comparison';
import { AccuracySample } from '../../src/modules/imports';
import { CsvSeedSource } from '../../src/modules/imports/infrastructure/csv-seed-source';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { stableId } from '../../src/modules/imports/application/stable-id';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const HEADER = 'osm_id;producto;marca;cantidad;unidad;unidades_empaque;precio;fecha;responsable';
const productId = stableId('product', 'arroz de exactitud', 'marca de prueba');
const presentationId = stableId('presentation', productId, '500', 'g', '1');
const storeId = stableId('establishment', 'node/990001');

// PR-22 (#93): pnpm quality:accuracy contrasta la muestra del equipo con lo que Valora publica.
describe('pnpm quality:accuracy', () => {
  let context: INestApplicationContext;
  let db: Database;
  let folder: string;

  beforeAll(async () => {
    // El mismo módulo que el comando: si le falta una dependencia, falla aquí (como pasó con db:seed).
    context = await NestFactory.createApplicationContext(AccuracyModule, {
      logger: false,
      abortOnError: false,
    });
    db = context.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'valora-exactitud-'));
    await db.execute(sql`truncate comparison.price_current`);
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('el informe trae cada fila contra el precio publicado y el resumen', async () => {
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'e9999999-9999-4999-8999-000000000001',
      priceCop: 2600,
      priceType: 'normal',
      observedAt: new Date('2026-11-13T17:00:00Z'),
      receivedAt: new Date('2026-11-13T17:00:05Z'),
    });
    writeFileSync(
      join(folder, 'muestra-exactitud.csv'),
      [
        HEADER,
        'node/990001;Arroz de exactitud;Marca de prueba;500;g;1;2500;2026-11-14;Integrante de prueba',
        'node/990002;Arroz de exactitud;Marca de prueba;500;g;1;2400;2026-11-14;Integrante de prueba',
      ].join('\n'),
    );

    const report = await accuracyReport(
      new AccuracySample(new CsvSeedSource(folder)),
      context.get(CurrentPriceOf),
      new Date('2026-11-15T15:00:00Z'),
    );

    expect(report.ok).toBe(true);
    const markdown = report.ok ? report.markdown : '';
    expect(markdown).toContain(
      '| Filas | Comparadas | Coinciden | Sin precio en Valora | Mediana de la diferencia |',
    );
    expect(markdown).toContain('| 2 | 1 | 0 | 1 | 4 % |');
    expect(markdown).toContain(
      '| 2 | node/990001 | Arroz de exactitud Marca de prueba 500 g | $2.500 (2026-11-14) | $2.600 (2026-11-13, vigente) | +$100 (+4 %) | 1 | Integrante de prueba |',
    );
    expect(markdown).toContain(
      '| 3 | node/990002 | Arroz de exactitud Marca de prueba 500 g | $2.400 (2026-11-14) | Sin precio en Valora | — | — | Integrante de prueba |',
    );
  });

  it('una fila inválida no genera informe y dice cuál es', async () => {
    writeFileSync(
      join(folder, 'muestra-exactitud.csv'),
      `${HEADER}\nnode/990001;Arroz de exactitud;Marca de prueba;500;g;1;0;2026-11-14;Integrante de prueba`,
    );

    await expect(
      accuracyReport(
        new AccuracySample(new CsvSeedSource(folder)),
        context.get(CurrentPriceOf),
        new Date('2026-11-15T15:00:00Z'),
      ),
    ).resolves.toEqual({
      ok: false,
      errors: ['muestra-exactitud.csv, fila 2: el precio debe ser un entero mayor que 0'],
    });
  });
});
