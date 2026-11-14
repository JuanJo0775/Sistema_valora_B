import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';

// Presentación y tienda de prueba: solo existen dentro de esta prueba.
const presentationId = 'c1111111-1111-4111-8111-111111111111';
const establishmentId = 'c2222222-2222-4222-8222-222222222222';

interface Reported {
  reportId: string;
  priceCop: number;
  observedAt: string;
  receivedAt: string;
  // Veredicto de reliability (grill de la #31, pregunta 4); por defecto, normal.
  verdict?: 'normal' | 'sospechoso' | 'sin_datos';
}

describe('precio vigente en comparison, actualizado por PriceAssessed (ADR-004, #31)', () => {
  let app: INestApplication;
  let db: Database;
  let events: typeof Events;

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate comparison.price_current, shared.outbox, shared.processed_events`,
    );
  });

  const report = async (reported: Reported): Promise<void> => {
    const { verdict = 'normal', ...price } = reported;
    const event = events.createEvent('PriceAssessed', 1, {
      ...price,
      presentationId,
      establishmentId,
      priceType: 'normal',
      verdict,
      reason: verdict === 'sospechoso' ? 'rango' : null,
    });
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };

  const currentPrice = async () => {
    const result = await db.execute<{ report_id: string; price_cop: number }>(
      sql`select report_id, price_cop from comparison.price_current`,
    );
    return result.rows;
  };

  const currentStatus = async () => {
    const result = await db.execute<{ report_id: string; status: string }>(
      sql`select report_id, status from comparison.price_current`,
    );
    return result.rows;
  };

  it('el primer reporte de una presentación en una tienda queda como precio vigente', async () => {
    await report({
      reportId: 'c3333333-3333-4333-8333-333333333333',
      priceCop: 4500,
      observedAt: '2026-11-12T12:00:00.000Z',
      receivedAt: '2026-11-12T12:01:00.000Z',
    });

    expect(await currentPrice()).toEqual([
      { report_id: 'c3333333-3333-4333-8333-333333333333', price_cop: 4500 },
    ]);
  });

  it('un reporte tardío no reemplaza el vigente, y uno más reciente sí', async () => {
    const noon = {
      reportId: 'c4444444-4444-4444-8444-444444444444',
      priceCop: 4500,
      observedAt: '2026-11-12T12:00:00.000Z',
      receivedAt: '2026-11-12T12:01:00.000Z',
    };
    await report(noon);

    await report({
      reportId: 'c5555555-5555-4555-8555-555555555555',
      priceCop: 3900,
      observedAt: '2026-11-12T09:00:00.000Z',
      receivedAt: '2026-11-12T15:00:00.000Z',
    });
    expect(await currentPrice()).toEqual([{ report_id: noon.reportId, price_cop: 4500 }]);

    await report({
      reportId: 'c6666666-6666-4666-8666-666666666666',
      priceCop: 4800,
      observedAt: '2026-11-12T16:00:00.000Z',
      receivedAt: '2026-11-12T16:01:00.000Z',
    });
    expect(await currentPrice()).toEqual([
      { report_id: 'c6666666-6666-4666-8666-666666666666', price_cop: 4800 },
    ]);
  });

  // Grill de la #31, pregunta 5.
  it('un precio sospechoso no reemplaza al vigente', async () => {
    await report({
      reportId: 'c7777777-7777-4777-8777-111111111111',
      priceCop: 5000,
      observedAt: '2026-11-12T12:00:00.000Z',
      receivedAt: '2026-11-12T12:01:00.000Z',
    });

    await report({
      reportId: 'c7777777-7777-4777-8777-222222222222',
      priceCop: 1500,
      observedAt: '2026-11-12T16:00:00.000Z',
      receivedAt: '2026-11-12T16:01:00.000Z',
      verdict: 'sospechoso',
    });

    expect(await currentStatus()).toEqual([
      { report_id: 'c7777777-7777-4777-8777-111111111111', status: 'vigente' },
    ]);
  });

  it('sin precio previo, un sospechoso entra en revisión; un normal posterior lo reemplaza', async () => {
    await report({
      reportId: 'c8888888-8888-4888-8888-111111111111',
      priceCop: 1500,
      observedAt: '2026-11-12T12:00:00.000Z',
      receivedAt: '2026-11-12T12:01:00.000Z',
      verdict: 'sospechoso',
    });
    expect(await currentStatus()).toEqual([
      { report_id: 'c8888888-8888-4888-8888-111111111111', status: 'en_revision' },
    ]);

    await report({
      reportId: 'c8888888-8888-4888-8888-222222222222',
      priceCop: 5000,
      observedAt: '2026-11-12T11:00:00.000Z',
      receivedAt: '2026-11-12T13:00:00.000Z',
    });
    expect(await currentStatus()).toEqual([
      { report_id: 'c8888888-8888-4888-8888-222222222222', status: 'vigente' },
    ]);
  });
});
