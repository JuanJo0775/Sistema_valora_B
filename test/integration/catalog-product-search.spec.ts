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

  it('ordena por parecido con lo escrito, desempata por nombre y respeta el límite', async () => {
    const dairy = 'dairy-eggs';
    await db.insert(products).values([
      {
        id: 'd1111111-1111-4111-8111-111111111111',
        name: 'Galletas con leche',
        categoryCode: 'bakery',
      },
      { id: 'd2222222-2222-4222-8222-222222222222', name: 'Leche', categoryCode: dairy },
      { id: 'd3333333-3333-4333-8333-333333333333', name: 'Leche entera', categoryCode: dairy },
      {
        id: 'd4444444-4444-4444-8444-444444444444',
        name: 'Leche deslactosada',
        categoryCode: dairy,
      },
    ]);

    const found = await repository.search({ text: 'leche', limit: 20 });
    const firstTwo = await repository.search({ text: 'leche', limit: 2 });

    expect(found[0]?.name).toBe('Leche');
    expect(found.at(-1)?.name).toBe('Galletas con leche');
    expect(firstTwo).toHaveLength(2);
  });

  it('a igual parecido, ordena por nombre', async () => {
    await db.insert(products).values([
      { id: 'e2222222-2222-4222-8222-222222222222', name: 'Pan blanco', categoryCode: 'bakery' },
      { id: 'e1111111-1111-4111-8111-111111111111', name: 'Pan blando', categoryCode: 'bakery' },
    ]);

    const found = await repository.search({ text: 'pan', limit: 20 });

    expect(found.map((product) => product.name)).toEqual(['Pan blanco', 'Pan blando']);
  });
});
