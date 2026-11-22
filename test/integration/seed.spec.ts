import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../../src/app.module';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { RunSeed } from '../../src/modules/imports/application/run-seed';
import { CsvSeedSource } from '../../src/modules/imports/infrastructure/csv-seed-source';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// #213: con la columna municipio.
const STORES_HEADER =
  'osm_id;nombre;tipo;direccion;lat;lng;municipio;tipo_osm;revisar;fuente;fecha_consulta';
const PRODUCTS_HEADER =
  'producto;marca;categoria;cantidad;unidad;unidades_empaque;codigo_barras;verificar;fuente;responsable;fecha';

// CSV de prueba, con el mismo formato que seed/: nada de esto es un dato real.
const storesCsv = (address: string): string =>
  [
    STORES_HEADER,
    `node/1;Tienda de prueba A;barrio;${address};4.5339;-75.6811;armenia;general;no;Prueba;2026-11-12`,
    'node/2;Tienda de prueba B;descuento;;4.5400;-75.6800;armenia;supermarket;no;Prueba;2026-11-12',
    'node/3;Tienda pendiente;barrio;;4.5450;-75.6700;armenia;general;sí;Prueba;2026-11-12',
  ].join('\n');
const productsCsv = [
  PRODUCTS_HEADER,
  'Arroz de prueba;Marca de prueba;grains-groceries;500;g;1;7702511000014;no;Prueba;Integrante de prueba;2026-11-12',
  'Arroz de prueba;Marca de prueba;grains-groceries;1;kg;1;;no;Prueba;Integrante de prueba;2026-11-12',
].join('\n');

describe('pnpm db:seed', () => {
  let app: INestApplication;
  let db: Database;
  let folder: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'valora-seed-'));
    await db.execute(
      sql`truncate catalog.presentations, catalog.products, establishments.establishments`,
    );
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  const runSeed = (stores: string) => {
    writeFileSync(join(folder, 'tiendas.csv'), stores);
    writeFileSync(join(folder, 'productos.csv'), productsCsv);
    return new RunSeed(
      new CsvSeedSource(folder),
      app.get(ImportCatalog),
      app.get(ImportEstablishments),
    ).execute();
  };

  const count = async (table: string): Promise<number> => {
    const result = await db.execute<{ count: string }>(
      sql.raw(`select count(*) as count from ${table}`),
    );
    return Number(result.rows[0]?.count);
  };

  it('correrla dos veces deja los mismos datos, y un cambio en el CSV actualiza la fila', async () => {
    const first = await runSeed(storesCsv(''));
    await runSeed(storesCsv(''));
    const third = await runSeed(storesCsv('Cra. 14 #20-30'));

    expect(first).toEqual({
      ok: true,
      stores: { saved: 2, skipped: 1 },
      products: { saved: 1, presentations: 2, skipped: 0 },
      references: { saved: 0, skipped: 0 },
      notInFiles: { stores: 0, products: 0 },
    });
    expect(third).toMatchObject({ ok: true });
    expect(await count('establishments.establishments')).toBe(2);
    expect(await count('catalog.products')).toBe(1);
    expect(await count('catalog.presentations')).toBe(2);
    const address = await db.execute<{ address: string }>(
      sql`select address from establishments.establishments where name = 'Tienda de prueba A'`,
    );
    expect(address.rows[0]?.address).toBe('Cra. 14 #20-30');
  });

  // B#118: el catálogo real crece por partes; si una fila verificada queda mal (categoría,
  // código de barras, bases de unidad), la CI lo dice antes de que pnpm db:seed falle.
  it('los archivos reales de seed/ cargan sin errores', async () => {
    const result = await new RunSeed(
      new CsvSeedSource(join(process.cwd(), 'seed')),
      app.get(ImportCatalog),
      app.get(ImportEstablishments),
    ).execute();

    expect(result).toMatchObject({ ok: true });
    expect(await count('catalog.presentations')).toBeGreaterThan(0);
  });
});
