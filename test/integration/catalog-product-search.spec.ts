import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleProductImportRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-import-repository';
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
    await db.execute(sql`truncate catalog.presentations, catalog.products cascade`);
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

    // similarity de pg_trgm: «Leche» 1,0 > «Leche entera» 0,46 > empate en 0,32, que se ordena por nombre.
    expect(found.map((product) => product.name)).toEqual([
      'Leche',
      'Leche entera',
      'Galletas con leche',
      'Leche deslactosada',
    ]);
    expect(firstTwo.map((product) => product.name)).toEqual(['Leche', 'Leche entera']);
  });

  it('a igual parecido, ordena por nombre', async () => {
    await db.insert(products).values([
      { id: 'e2222222-2222-4222-8222-222222222222', name: 'Pan blanco', categoryCode: 'bakery' },
      { id: 'e1111111-1111-4111-8111-111111111111', name: 'Pan blando', categoryCode: 'bakery' },
    ]);

    const found = await repository.search({ text: 'pan', limit: 20 });

    expect(found.map((product) => product.name)).toEqual(['Pan blanco', 'Pan blando']);
  });

  it('los comodines que escribe el usuario (% y _) se buscan como texto, no coinciden con todo', async () => {
    await db
      .insert(products)
      .values([
        sunflowerOil,
        { ...rice, name: 'Jugo 100% naranja' },
        { ...otherRice, name: 'Arroz_extra' },
      ]);

    const names = async (text: string) =>
      (await repository.search({ text, limit: 20 })).map((product) => product.name);

    expect(await names('%')).toEqual(['Jugo 100% naranja']);
    expect(await names('100%')).toEqual(['Jugo 100% naranja']);
    expect(await names('_')).toEqual(['Arroz_extra']);
  });

  it('por código de barras encuentra el producto de esa presentación, o nada si nadie lo tiene', async () => {
    await db.insert(products).values([sunflowerOil, rice]);
    await db.insert(presentations).values([
      {
        id: 'a1111111-1111-4111-8111-aaaaaaaaaaaa',
        productId: sunflowerOil.id,
        quantity: '1000',
        unit: 'ml',
        barcode: '7702511000014',
      },
      {
        id: 'a1111111-1111-4111-8111-bbbbbbbbbbbb',
        productId: sunflowerOil.id,
        quantity: '3000',
        unit: 'ml',
      },
    ]);

    const found = await repository.findByBarcode('7702511000014');

    expect(found.map((product) => product.name)).toEqual(['Aceite de girasol']);
    expect(found[0]?.presentations).toHaveLength(2);
    await expect(repository.findByBarcode('7700000000000')).resolves.toEqual([]);
  });

  // Grill de la #26, preguntas 1 y 2: alias e imagen del producto.
  it('encuentra un producto por su alias, sin tildes ni mayúsculas, y lo devuelve con su imagen', async () => {
    await new DrizzleProductImportRepository(db).save({
      id: sunflowerOil.id,
      name: 'Bebida gaseosa de cola',
      categoryCode: 'beverages',
      aliases: ['Refresco', 'Gaseosa negra'],
      image: {
        url: 'https://images.openfoodfacts.org/images/products/770/123/456/7897/front.jpg',
        source: 'open_food_facts',
        attribution: 'Open Food Facts, CC BY-SA',
      },
      presentations: [
        { id: 'a1111111-1111-4111-8111-aaaaaaaaaaaa', quantity: 400, unit: 'ml', packCount: 1 },
      ],
    });

    const byAlias = await repository.search({ text: 'REFRÉSCO', limit: 20 });
    const product = await repository.findById(sunflowerOil.id);

    expect(byAlias.map((found) => found.id)).toEqual([sunflowerOil.id]);
    expect(product?.image).toEqual({
      url: 'https://images.openfoodfacts.org/images/products/770/123/456/7897/front.jpg',
      source: 'open_food_facts',
      attribution: 'Open Food Facts, CC BY-SA',
    });
  });

  it('volver a importar un producto reemplaza sus alias', async () => {
    const save = new DrizzleProductImportRepository(db);
    const base = {
      id: rice.id,
      name: rice.name,
      categoryCode: rice.categoryCode,
      presentations: [
        {
          id: 'b2222222-2222-4222-8222-aaaaaaaaaaaa',
          quantity: 500,
          unit: 'g' as const,
          packCount: 1,
        },
      ],
    };
    await save.save({ ...base, aliases: ['Arroz de mesa'] });

    await save.save({ ...base, aliases: ['Arroz blanco premium'] });

    await expect(repository.search({ text: 'mesa', limit: 20 })).resolves.toEqual([]);
    expect(
      (await repository.search({ text: 'premium', limit: 20 })).map((found) => found.id),
    ).toEqual([rice.id]);
  });
});
