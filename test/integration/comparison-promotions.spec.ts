import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Datos de prueba: solo existen dentro de esta prueba.
const promotionId = 'c6111111-1111-4111-8111-111111111111';
const establishmentId = 'c6222222-2222-4222-8222-222222222222';
const presentationId = 'c6333333-3333-4333-8333-333333333333';

// D6 del grill comercial (#206): comparison guarda su copia de las promociones con los eventos de
// commerce, sin importar commerce (regla nucleo-no-conoce-commerce).
describe('copia de las promociones en comparison (#206)', () => {
  let app: INestApplication;
  let db: Database;
  let events: typeof Events;

  beforeAll(async () => {
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const { AppModule } = await import('../../src/app.module');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    events = await import('../../src/shared/events');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate comparison.promotions, shared.outbox, shared.processed_events`);
  });

  const deliver = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    const event = events.createEvent(type, 1, payload);
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };
  const copies = async () =>
    (
      await db.execute<{ id: string; offer: unknown; valid_until: string }>(
        sql`select id, offer, valid_until::text from comparison.promotions`,
      )
    ).rows;

  it('una promoción publicada queda copiada y al retirarla desaparece', async () => {
    await deliver('PromotionPublished', {
      id: promotionId,
      establishmentId,
      presentationId,
      offer: { type: 'descuento_porcentual', percent: 20 },
      conditions: { whileStocksLast: true, paymentMethod: 'efectivo' },
      validFrom: '2026-11-22',
      validUntil: '2026-11-30',
      createdAt: '2026-11-22T15:00:00.000Z',
    });

    await expect(copies()).resolves.toEqual([
      {
        id: promotionId,
        offer: { type: 'descuento_porcentual', percent: 20 },
        valid_until: '2026-11-30',
      },
    ]);

    await deliver('PromotionWithdrawn', { id: promotionId, establishmentId, presentationId });

    await expect(copies()).resolves.toEqual([]);
  });
});
