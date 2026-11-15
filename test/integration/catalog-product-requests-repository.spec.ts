import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NewProductRequest } from '../../src/modules/catalog/application/product-requests';
import { DrizzleProductImportRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-import-repository';
import { DrizzleProductRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-repository';
import { DrizzleProductRequestRepository } from '../../src/modules/catalog/infrastructure/drizzle-product-request-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Propuestas y productos de prueba: solo existen dentro de esta prueba.
const request: NewProductRequest = {
  id: 'da111111-1111-4111-8111-111111111111',
  name: 'Panela pulverizada',
  brand: 'La Molienda',
  categoryCode: 'grains-groceries',
  quantity: 500,
  unit: 'g',
  packCount: 1,
  barcode: '7701234567897',
  requesterKey: 'a'.repeat(64),
  createdAt: new Date('2026-11-15T10:00:00Z'),
};
const rice = {
  id: 'db222222-2222-4222-8222-222222222222',
  name: 'Arroz blanco',
  categoryCode: 'grains-groceries',
  presentations: [
    { id: 'db222222-2222-4222-8222-aaaaaaaaaaaa', quantity: 500, unit: 'g' as const, packCount: 1 },
  ],
};
const decision = {
  note: 'Producto verificado en la tienda',
  moderatorKey: 'c'.repeat(64),
  decidedAt: new Date('2026-11-15T12:00:00Z'),
};

describe('propuestas de productos (RF-003, #26)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let requests: DrizzleProductRequestRepository;
  let products: DrizzleProductRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    requests = new DrizzleProductRequestRepository(db);
    products = new DrizzleProductRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate catalog.product_requests, catalog.presentations, catalog.products, catalog.product_aliases`,
    );
  });

  it('una propuesta queda pendiente y no aparece en la búsqueda', async () => {
    await requests.save(request);

    await expect(requests.pending()).resolves.toEqual([request]);
    await expect(products.search({ text: 'panela', limit: 20 })).resolves.toEqual([]);
  });

  it('aprobarla crea el producto con el id de la propuesta y su presentación', async () => {
    await requests.save(request);

    await expect(
      requests.decide({ requestId: request.id, decision: 'aprobar', ...decision }),
    ).resolves.toBe(true);

    await expect(requests.pending()).resolves.toEqual([]);
    await expect(products.findById(request.id)).resolves.toEqual({
      id: request.id,
      name: 'Panela pulverizada',
      brand: 'La Molienda',
      category: { code: 'grains-groceries', name: expect.any(String) as unknown },
      presentations: [
        {
          id: expect.any(String) as unknown,
          barcode: '7701234567897',
          quantity: 500,
          unit: 'g',
          packCount: 1,
        },
      ],
    });
    // Una propuesta ya decidida no se decide otra vez.
    await expect(
      requests.decide({ requestId: request.id, decision: 'rechazar', ...decision }),
    ).resolves.toBe(false);
  });

  it('fusionarla agrega el nombre propuesto como alias y la presentación solo si es nueva', async () => {
    await new DrizzleProductImportRepository(db).save(rice);
    const samePresentation: NewProductRequest = {
      id: request.id,
      name: 'Arroz de mesa',
      categoryCode: 'grains-groceries',
      quantity: 500,
      unit: 'g',
      packCount: 1,
      requesterKey: request.requesterKey,
      createdAt: request.createdAt,
    };
    const newPresentation: NewProductRequest = {
      ...samePresentation,
      id: 'da111111-1111-4111-8111-222222222222',
      name: 'Arroz de la casa',
      quantity: 1,
      unit: 'kg',
    };
    await requests.save(samePresentation);
    await requests.save(newPresentation);

    for (const id of [samePresentation.id, newPresentation.id]) {
      await requests.decide({
        requestId: id,
        decision: 'fusionar',
        mergeInto: rice.id,
        ...decision,
      });
    }

    const byAlias = await products.search({ text: 'arroz de mesa', limit: 20 });
    expect(byAlias.map((found) => found.id)).toEqual([rice.id]);
    const merged = await products.findById(rice.id);
    expect(
      merged?.presentations.map(({ quantity, unit }) => `${String(quantity)} ${unit}`).sort(),
    ).toEqual(['1 kg', '500 g']);
    await expect(products.findById(samePresentation.id)).resolves.toBeNull();
  });

  it('rechazarla no crea nada', async () => {
    await requests.save(request);

    await requests.decide({ requestId: request.id, decision: 'rechazar', ...decision });

    await expect(requests.pending()).resolves.toEqual([]);
    await expect(products.findById(request.id)).resolves.toBeNull();
  });
});
