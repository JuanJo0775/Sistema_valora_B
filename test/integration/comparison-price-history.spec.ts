import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { DrizzlePriceHistory } from '../../src/modules/comparison/infrastructure/drizzle-price-history';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Presentación y tiendas de prueba: solo existen dentro de esta prueba.
const presentationId = 'c3111111-1111-4111-8111-111111111111';
const establishmentId = 'c3222222-2222-4222-8222-222222222222';
const otherStore = 'c3222222-2222-4222-8222-333333333333';
const since = new Date('2026-11-01T05:00:00Z');

describe('historial de precios en comparison, alimentado por eventos (#83)', () => {
  let app: INestApplication;
  let db: Database;
  let events: typeof Events;
  let history: DrizzlePriceHistory;

  beforeAll(async () => {
    // Intervalo muy largo: el repartidor se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const { AppModule } = await import('../../src/app.module');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    events = await import('../../src/shared/events');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
    history = new DrizzlePriceHistory(db);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate comparison.price_history, comparison.price_current, shared.outbox, shared.processed_events`,
    );
  });

  const deliver = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    const event = events.createEvent(type, 1, payload);
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };
  const assessed = (
    reportId: string,
    priceCop: number,
    verdict: 'normal' | 'sospechoso' = 'normal',
    store = establishmentId,
  ) =>
    deliver('PriceAssessed', {
      reportId,
      presentationId,
      establishmentId: store,
      priceCop,
      priceType: 'normal',
      observedAt: '2026-11-14T15:00:00Z',
      receivedAt: '2026-11-14T15:01:00Z',
      verdict,
      reason: verdict === 'sospechoso' ? 'rango' : null,
    });
  const counted = (store?: string) => history.countedSince([presentationId], since, store);

  it('un precio evaluado queda en el historial, sin datos de quién lo reportó', async () => {
    await assessed('c3333333-3333-4333-8333-000000000001', 2500);

    await expect(counted()).resolves.toEqual([
      { presentationId, priceCop: 2500, observedAt: new Date('2026-11-14T15:00:00Z') },
    ]);
  });

  it('un sospechoso no cuenta hasta que el moderador lo aprueba', async () => {
    const reportId = 'c3333333-3333-4333-8333-000000000002';
    await assessed(reportId, 900, 'sospechoso');
    await expect(counted()).resolves.toEqual([]);

    // Grill de la #32, pregunta 4: aprobarlo vuelve a publicar PriceAssessed como normal.
    await assessed(reportId, 900, 'normal');

    await expect(counted()).resolves.toHaveLength(1);
  });

  it('un precio descartado por moderación sale del historial', async () => {
    const reportId = 'c3333333-3333-4333-8333-000000000003';
    await assessed(reportId, 2500);

    await deliver('PriceWithdrawn', {
      reportId,
      presentationId,
      establishmentId,
      replacement: null,
    });

    await expect(counted()).resolves.toEqual([]);
  });

  it('filtra por tienda y deja fuera lo anterior a la ventana', async () => {
    await assessed('c3333333-3333-4333-8333-000000000004', 2500);
    await assessed('c3333333-3333-4333-8333-000000000005', 2700, 'normal', otherStore);

    const inStore = await counted(otherStore);
    const later = await history.countedSince([presentationId], new Date('2026-11-15T05:00:00Z'));

    expect(inStore.map((price) => price.priceCop)).toEqual([2700]);
    expect(later).toEqual([]);
  });
});
