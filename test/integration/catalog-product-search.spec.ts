import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-repository';
import { presentations, products } from '../../src/modules/catalog/infrastructure/schema';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Productos de prueba: solo existen dentro de esta prueba.
const sunflowerOil = {
  id: 'a1111111-1111-4111-8111-111111111111',
  name: 'Aceite de girasol',
  categoryCode: 'grains-groceries',
};
const rice = {
  id: 'b2222222-2222-4222-8222-222222222222',
  name: 'Arroz blanco',
  categoryCode: 'grains-groceries',
};
const otherRice = {
  id: 'c3333333-3333-4333-8333-333333333333',
  name: 'Arroz integral',
  categoryCode: 'grains-groceries',
};

describe('búsqueda de productos del catálogo', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let repository: DrizzleProductRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    repository = new DrizzleProductRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate catalog.presentations, catalog.products`);
  });

  it('«aceite girasól» encuentra «Aceite de girasol»: sin tildes, sin mayúsculas y con palabras no seguidas', async () => {
    await db.insert(products).values(sunflowerOil);
    await db.insert(presentations).values({
      id: 'a1111111-1111-4111-8111-aaaaaaaaaaaa',
      productId: sunflowerOil.id,
      quantity: '1000',
      unit: 'ml',
    });

    const found = await repository.search({ text: 'aceite girasól', limit: 20 });

    expect(found).toEqual([
      {
        id: sunflowerOil.id,
        name: 'Aceite de girasol',
        category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
        presentations: [
          {
            id: 'a1111111-1111-4111-8111-aaaaaaaaaaaa',
            quantity: 1000,
            unit: 'ml',
            packCount: 1,
          },
        ],
      },
    ]);
  });

  it('encuentra por un pedazo de palabra y por la marca, y no muestra productos sin todas las palabras', async () => {
    await db
      .insert(products)
      .values([sunflowerOil, { ...rice, brand: 'Diana' }, { ...otherRice, brand: 'Roa' }]);

    const names = async (text: string) =>
      (await repository.search({ text, limit: 20 })).map((product) => product.name);

    expect(await names('gira')).toEqual(['Aceite de girasol']);
    expect(await names('arroz diana')).toEqual(['Arroz blanco']);
    expect(await names('aceite diana')).toEqual([]);
  });
});
