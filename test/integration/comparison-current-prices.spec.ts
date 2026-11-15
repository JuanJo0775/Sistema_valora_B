import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleCurrentPrices } from '../../src/modules/comparison/infrastructure/drizzle-current-prices';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Presentaciones y tiendas de prueba: solo existen dentro de esta prueba.
const halfKilo = 'd1111111-1111-4111-8111-111111111111';
const oneKilo = 'd1111111-1111-4111-8111-222222222222';
const otherProduct = 'd1111111-1111-4111-8111-333333333333';
const storeA = 'd2222222-2222-4222-8222-aaaaaaaaaaaa';
const storeB = 'd2222222-2222-4222-8222-bbbbbbbbbbbb';
const observedAt = new Date('2026-11-12T13:00:00Z');

const row = (presentationId: string, establishmentId: string, priceCop: number) => ({
  presentationId,
  establishmentId,
  reportId: crypto.randomUUID(),
  priceCop,
  priceType: 'normal',
  observedAt,
  receivedAt: new Date('2026-11-12T13:00:02Z'),
});

describe('precios vigentes que lee la comparación', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let prices: DrizzleCurrentPrices;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    prices = new DrizzleCurrentPrices(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate comparison.price_current`);
  });

  it('lee de price_current solo las presentaciones pedidas', async () => {
    await db
      .insert(priceCurrent)
      .values([
        row(halfKilo, storeA, 2000),
        row(halfKilo, storeB, 2100),
        row(oneKilo, storeA, 3900),
        row(otherProduct, storeA, 9000),
      ]);

    const found = await prices.findByPresentations([halfKilo, oneKilo]);

    expect(found).toHaveLength(3);
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          presentationId: halfKilo,
          establishmentId: storeA,
          priceCop: 2000,
          observedAt,
          status: 'vigente',
        }),
        expect.objectContaining({
          presentationId: halfKilo,
          establishmentId: storeB,
          priceCop: 2100,
          observedAt,
          status: 'vigente',
        }),
        expect.objectContaining({
          presentationId: oneKilo,
          establishmentId: storeA,
          priceCop: 3900,
          observedAt,
          status: 'vigente',
        }),
      ]),
    );
    await expect(prices.findByPresentations([])).resolves.toEqual([]);
  });

  // Grill de la #28: los precios de una tienda.
  it('lee de price_current todos los precios de una tienda y ninguno de otra', async () => {
    await db
      .insert(priceCurrent)
      .values([
        row(halfKilo, storeA, 2000),
        row(oneKilo, storeA, 3900),
        row(halfKilo, storeB, 2100),
      ]);

    const found = await prices.findByEstablishment(storeA);

    expect(found.map((price) => [price.presentationId, price.priceCop]).sort()).toEqual(
      [
        [halfKilo, 2000],
        [oneKilo, 3900],
      ].sort(),
    );
    await expect(
      prices.findByEstablishment('d2222222-2222-4222-8222-cccccccccccc'),
    ).resolves.toEqual([]);
  });
});
