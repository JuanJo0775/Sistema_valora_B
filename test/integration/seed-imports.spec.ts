import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'f1111111-1111-4111-8111-111111111111';
const presentationId = 'f1111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = 'f2222222-2222-4222-8222-222222222222';

describe('importación de la semilla por la interfaz pública de catalog y establishments', () => {
  let app: INestApplication;
  let db: Database;
  let catalog: ImportCatalog;
  let establishments: ImportEstablishments;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
    catalog = app.get(ImportCatalog);
    establishments = app.get(ImportEstablishments);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate catalog.presentations, catalog.products, establishments.establishments`,
    );
  });

  const count = async (table: string): Promise<number> => {
    const result = await db.execute<{ count: string }>(
      sql.raw(`select count(*) as count from ${table}`),
    );
    return Number(result.rows[0]?.count);
  };

  it('guardar dos veces el mismo producto lo actualiza sin duplicarlo', async () => {
    const presentation = { id: presentationId, quantity: 500, unit: 'g' as const, packCount: 1 };
    const product = {
      id: productId,
      name: 'Producto de prueba',
      categoryCode: 'grains-groceries',
      presentations: [presentation],
    };

    await catalog.save(product);
    await catalog.save({
      ...product,
      brand: 'Marca de prueba',
      presentations: [{ ...presentation, barcode: '7702511000014' }],
    });

    expect(await count('catalog.products')).toBe(1);
    expect(await count('catalog.presentations')).toBe(1);
    const saved = await db.execute<{ brand: string; barcode: string }>(
      sql`select p.brand, pr.barcode from catalog.products p join catalog.presentations pr on pr.product_id = p.id`,
    );
    expect(saved.rows[0]).toEqual({ brand: 'Marca de prueba', barcode: '7702511000014' });
    await expect(catalog.listProductIds()).resolves.toEqual([productId]);
  });

  it('guardar dos veces la misma tienda la actualiza sin duplicarla', async () => {
    const store = {
      id: storeId,
      name: 'Tienda de prueba',
      type: 'barrio' as const,
      lat: 4.5339,
      lng: -75.6811,
    };

    await establishments.save(store);
    await establishments.save({ ...store, address: 'Cra. 14 #20-30' });

    expect(await count('establishments.establishments')).toBe(1);
    const saved = await db.execute<{ address: string }>(
      sql`select address from establishments.establishments`,
    );
    expect(saved.rows[0]?.address).toBe('Cra. 14 #20-30');
    await expect(establishments.listIds()).resolves.toEqual([storeId]);
  });
});
