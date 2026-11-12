import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-repository';
import { presentations, products } from '../../src/modules/catalog/infrastructure/schema';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

const riceId = '3f1c2a64-5c1e-4b8a-9d61-0a7b1f2e3c4d';

describe('repositorio de productos con Drizzle', () => {
  let pool: Pool;
  let db: NodePgDatabase;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  // Las categorías no se borran: son datos de referencia que carga la migración.
  beforeEach(async () => {
    await db.execute(sql`truncate catalog.presentations, catalog.products`);
  });

  it('lee un producto guardado con su categoría y sus presentaciones', async () => {
    await db.insert(products).values({
      id: riceId,
      name: 'Arroz blanco',
      brand: 'Diana',
      categoryCode: 'grains-groceries',
    });
    await db.insert(presentations).values([
      {
        id: '9a2e7c10-1b2d-4e3f-8a9b-0c1d2e3f4a5b',
        productId: riceId,
        quantity: '1',
        unit: 'kg',
        barcode: '7702511000014',
      },
      {
        id: 'b71d0e22-3c4f-4a5b-9c6d-7e8f9a0b1c2d',
        productId: riceId,
        quantity: '330',
        unit: 'ml',
        packCount: 6,
      },
    ]);

    const product = await new DrizzleProductRepository(db).findById(riceId);

    expect(product).toEqual({
      id: riceId,
      name: 'Arroz blanco',
      brand: 'Diana',
      category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
      presentations: expect.arrayContaining([
        {
          id: '9a2e7c10-1b2d-4e3f-8a9b-0c1d2e3f4a5b',
          barcode: '7702511000014',
          quantity: 1,
          unit: 'kg',
          packCount: 1,
        },
        {
          id: 'b71d0e22-3c4f-4a5b-9c6d-7e8f9a0b1c2d',
          quantity: 330,
          unit: 'ml',
          packCount: 6,
        },
      ]) as unknown,
    });
  });

  it('devuelve null si el producto no existe', async () => {
    await expect(new DrizzleProductRepository(db).findById(riceId)).resolves.toBeNull();
  });
});
