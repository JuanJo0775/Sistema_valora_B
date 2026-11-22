import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { OfficialPrice } from '../../src/modules/commerce/application/official-prices';
import { DrizzleOfficialPriceRepository } from '../../src/modules/commerce/infrastructure/drizzle-official-price-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { createEvent, OutboxPublisher } from '../../src/shared/events';

const STORE = 'c1111111-1111-4111-8111-111111111111';
const OTHER_STORE = 'c1222222-2222-4222-8222-222222222222';
const RICE = 'c1333333-3333-4333-8333-333333333333';
const OIL = 'c1444444-4444-4444-8444-444444444444';

const price = (overrides: Partial<OfficialPrice> = {}): OfficialPrice => ({
  establishmentId: STORE,
  presentationId: RICE,
  priceCop: 2600,
  confirmedAt: new Date('2026-11-22T10:00:00Z'),
  ...overrides,
});
const published = () => [createEvent('OfficialPricePublished', 1, { presentationId: RICE })];

describe('precios oficiales en el esquema commerce (RF-016, #203)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let prices: DrizzleOfficialPriceRepository;
  const outboxTypes = async () =>
    (
      await db.execute<{ type: string }>(sql`select type from shared.outbox order by occurred_at`)
    ).rows.map((row) => row.type);

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    prices = new DrizzleOfficialPriceRepository(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate commerce.official_prices, shared.outbox`);
  });

  it('guarda el precio con su evento en la misma transacción', async () => {
    await prices.save(price(), published());

    await expect(prices.listFor(STORE)).resolves.toEqual([price()]);
    await expect(outboxTypes()).resolves.toEqual(['OfficialPricePublished']);
  });

  it('publicar otra vez la misma presentación reemplaza el precio y lo reconfirma, sin duplicar', async () => {
    await prices.save(price(), published());
    const later = price({ priceCop: 2800, confirmedAt: new Date('2026-11-25T10:00:00Z') });

    await prices.save(later, published());

    await expect(prices.listFor(STORE)).resolves.toEqual([later]);
  });

  it('reconfirmar todos actualiza solo los de esa tienda, dice cuántos y guarda su evento', async () => {
    await prices.save(price(), []);
    await prices.save(price({ presentationId: OIL }), []);
    await prices.save(price({ establishmentId: OTHER_STORE }), []);
    const at = new Date('2026-11-30T10:00:00Z');

    await expect(
      prices.reconfirmAll(STORE, at, [createEvent('OfficialPricesReconfirmed', 1, {})]),
    ).resolves.toBe(2);

    const mine = await prices.listFor(STORE);
    expect(mine.map((p) => p.confirmedAt)).toEqual([at, at]);
    await expect(prices.listFor(OTHER_STORE)).resolves.toEqual([
      price({ establishmentId: OTHER_STORE }),
    ]);
    await expect(outboxTypes()).resolves.toEqual(['OfficialPricesReconfirmed']);
  });
});
