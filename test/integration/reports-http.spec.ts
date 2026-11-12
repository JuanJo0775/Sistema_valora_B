import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Presentación y tienda de prueba: solo existen dentro de esta prueba.
const presentationId = 'b1111111-1111-4111-8111-aaaaaaaaaaaa';
const establishmentId = 'b2222222-2222-4222-8222-222222222222';
const idempotencyKey = 'b3333333-3333-4333-8333-333333333333';

// Un precio visto hace media hora.
const body = () => ({
  presentationId,
  establishmentId,
  priceCop: 4500,
  observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
});

describe('POST /v1/reports', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  beforeAll(async () => {
    // Intervalo muy largo: el repartidor del outbox se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
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
      sql`truncate pricing.reports, comparison.price_current, shared.outbox, shared.processed_events, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: 'b1111111-1111-4111-8111-111111111111',
      name: 'Producto de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    await app.get(ImportEstablishments).save({
      id: establishmentId,
      name: 'Tienda de prueba',
      type: 'barrio',
      lat: 4.5339,
      lng: -75.6811,
    });
  });

  const post = (payload: object, key: string | null = idempotencyKey) => {
    const call = request(server).post('/v1/reports').send(payload);
    return key === null ? call : call.set('Idempotency-Key', key);
  };

  it('responde 201 con el recibo, y el reintento idéntico responde 200 con el mismo recibo', async () => {
    const report = body();

    const created = await post(report).expect(201);
    expect(created.body).toEqual({
      id: expect.any(String) as unknown,
      status: 'recibido',
      receivedAt: expect.any(String) as unknown,
    });

    const retry = await post(report).expect(200);
    expect(retry.body).toEqual(created.body);
  });
});
