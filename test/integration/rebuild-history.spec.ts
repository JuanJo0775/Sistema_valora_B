import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { rebuildHistory } from '../../src/rebuild-history';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Presentación y tienda de prueba: solo existen dentro de esta prueba.
const presentationId = 'ec111111-1111-4111-8111-111111111111';
const establishmentId = 'ec222222-2222-4222-8222-222222222222';

describe('pnpm comparison:rebuild-history (grill de la #83, pregunta 6)', () => {
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
    await db.execute(
      sql`truncate comparison.price_history, comparison.price_current, shared.outbox, shared.processed_events`,
    );
  });

  const deliver = async (type: string, payload: Record<string, unknown>) => {
    const event = events.createEvent(type, 1, payload);
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };
  const assessed = (reportId: string, priceCop: number) =>
    deliver('PriceAssessed', {
      reportId,
      presentationId,
      establishmentId,
      priceCop,
      priceType: 'normal',
      observedAt: '2026-11-14T15:00:00Z',
      receivedAt: '2026-11-14T15:01:00Z',
      verdict: 'normal',
      reason: null,
    });
  const history = async () =>
    (
      await db.execute<{ report_id: string; status: string }>(
        sql`select report_id, status from comparison.price_history order by price_cop`,
      )
    ).rows;

  it('aplica los eventos ya entregados antes de que existiera el historial, y se puede repetir', async () => {
    await assessed('ec333333-3333-4333-8333-000000000001', 2400);
    await assessed('ec333333-3333-4333-8333-000000000002', 2600);
    await deliver('PriceWithdrawn', {
      reportId: 'ec333333-3333-4333-8333-000000000002',
      presentationId,
      establishmentId,
      replacement: null,
    });
    // Como si el historial no hubiera existido cuando se entregaron.
    await db.execute(
      sql`delete from shared.processed_events where consumer = 'comparison.price_history'`,
    );
    await db.execute(sql`truncate comparison.price_history`);
    const current = () => db.execute(sql`select * from comparison.price_current`);
    const before = (await current()).rows;

    const first = await rebuildHistory(app.get(events.OutboxRelay));
    const second = await rebuildHistory(app.get(events.OutboxRelay));

    expect(await history()).toEqual([
      { report_id: 'ec333333-3333-4333-8333-000000000001', status: 'cuenta' },
      { report_id: 'ec333333-3333-4333-8333-000000000002', status: 'retirado' },
    ]);
    expect(first).toBe('Historial reconstruido: 3 eventos revisados.');
    expect(second).toBe('Historial reconstruido: 3 eventos revisados.');
    // El precio vigente no se toca: su receptor ya había procesado esos eventos.
    expect((await current()).rows).toEqual(before);
  });
});
