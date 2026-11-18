import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { CACHE_PRICE_HISTORY } from '../../src/shared/http/cache-control';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { historyWindow } from '../../src/domain/price-history';
import { ImportCatalog } from '../../src/modules/catalog';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { createEvent, OutboxPublisher, OutboxRelay } from '../../src/shared/events';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'eb111111-1111-4111-8111-111111111111';
const small = 'eb111111-1111-4111-8111-aaaaaaaaaaaa';
const large = 'eb111111-1111-4111-8111-bbbbbbbbbbbb';
const storeId = 'eb222222-2222-4222-8222-222222222222';
const otherStore = 'eb222222-2222-4222-8222-333333333333';

describe('GET /v1/products/{productId}/history (RF-008 RN4, #83)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate comparison.price_history, comparison.price_current, shared.outbox, shared.processed_events, catalog.presentations, catalog.products`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz con historial',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: small, quantity: 500, unit: 'g', packCount: 1 },
        { id: large, quantity: 1, unit: 'kg', packCount: 1 },
      ],
    });
  });

  const assessed = async (reportId: string, priceCop: number, store = storeId) => {
    const event = createEvent('PriceAssessed', 1, {
      reportId,
      presentationId: small,
      establishmentId: store,
      priceCop,
      priceType: 'normal',
      observedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      receivedAt: new Date().toISOString(),
      verdict: 'normal',
      reason: null,
    });
    await db.transaction((tx) => app.get(OutboxPublisher).publish(tx, event));
    await app.get(OutboxRelay).runOnce();
  };

  it('200 público: una serie por presentación, con caché y ETag', async () => {
    await assessed('eb333333-3333-4333-8333-000000000001', 2400);
    await assessed('eb333333-3333-4333-8333-000000000002', 2600, otherStore);
    const { from, to } = historyWindow(new Date());

    const response = await request(server).get(`/v1/products/${productId}/history`).expect(200);
    const inStore = await request(server)
      .get(`/v1/products/${productId}/history`)
      .query({ establishmentId: otherStore })
      .expect(200);

    expect(response.headers['cache-control']).toBe(CACHE_PRICE_HISTORY);
    expect(response.headers['etag']).toBeDefined();
    expect(response.body).toEqual({
      from,
      to,
      presentations: [
        {
          presentationId: small,
          label: expect.stringContaining('Arroz con historial') as unknown,
          points: [
            { date: to, minPriceCop: 2400, avgPriceCop: 2500, reports: 2, source: 'reportado' },
          ],
        },
        {
          presentationId: large,
          label: expect.stringContaining('Arroz con historial') as unknown,
          points: [],
        },
      ],
    });
    expect(
      (inStore.body as { presentations: { points: { minPriceCop: number }[] }[] }).presentations[0]
        ?.points[0]?.minPriceCop,
    ).toBe(2600);
  });

  it('400 con ids que no son UUID; 404 si el producto no existe', async () => {
    const responses = await Promise.all([
      request(server).get('/v1/products/no-es-uuid/history'),
      request(server)
        .get(`/v1/products/${productId}/history`)
        .query({ establishmentId: 'no-es-uuid' }),
      request(server).get('/v1/products/eb999999-9999-4999-8999-999999999999/history'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 404]);
  });
});
