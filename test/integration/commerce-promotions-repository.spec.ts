import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Promotion } from '../../src/modules/commerce/application/promotions';
import { DrizzlePromotionRepository } from '../../src/modules/commerce/infrastructure/drizzle-promotion-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { createEvent, OutboxPublisher } from '../../src/shared/events';

const STORE = 'c5111111-1111-4111-8111-111111111111';
const OTHER_STORE = 'c5222222-2222-4222-8222-222222222222';
const RICE = 'c5333333-3333-4333-8333-333333333333';

const promotion = (id: string, overrides: Partial<Promotion> = {}): Promotion => ({
  id,
  establishmentId: STORE,
  presentationId: RICE,
  offer: { type: 'pague_x_lleve_y', payX: 2, takeY: 3 },
  conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
  validFrom: '2026-11-22',
  validUntil: '2026-11-30',
  createdAt: new Date('2026-11-22T15:00:00Z'),
  ...overrides,
});

describe('promociones en el esquema commerce (RF-017, #206)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let promotions: DrizzlePromotionRepository;
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
    promotions = new DrizzlePromotionRepository(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate commerce.promotions, shared.outbox`);
  });

  it('guarda la promoción con su oferta y sus condiciones, y su evento en la misma transacción', async () => {
    const saved = promotion('c5444444-4444-4444-8444-444444444444');

    await promotions.save(saved, [createEvent('PromotionPublished', 1, {})]);

    await expect(promotions.findById(saved.id)).resolves.toEqual(saved);
    await expect(outboxTypes()).resolves.toEqual(['PromotionPublished']);
  });

  it('lista las de la tienda, la más reciente primero', async () => {
    const older = promotion('c5555555-5555-4555-8555-555555555555');
    const newer = promotion('c5666666-6666-4666-8666-666666666666', {
      offer: { type: 'precio_especial', specialPriceCop: 2300 },
      conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
      createdAt: new Date('2026-11-23T15:00:00Z'),
    });
    await promotions.save(older, []);
    await promotions.save(newer, []);
    await promotions.save(
      promotion('c5777777-7777-4777-8777-777777777777', { establishmentId: OTHER_STORE }),
      [],
    );

    await expect(promotions.listFor(STORE)).resolves.toEqual([newer, older]);
  });

  it('retirarla la borra y guarda su evento en la misma transacción', async () => {
    const saved = promotion('c5888888-8888-4888-8888-888888888888');
    await promotions.save(saved, []);

    await promotions.delete(saved.id, [createEvent('PromotionWithdrawn', 1, {})]);

    await expect(promotions.findById(saved.id)).resolves.toBeNull();
    await expect(outboxTypes()).resolves.toEqual(['PromotionWithdrawn']);
  });
});
