import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { CACHE_PRICES } from '../../src/shared/http/cache-control';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Producto, presentación y tienda de prueba: solo existen dentro de esta prueba.
const productId = 'ec111111-1111-4111-8111-111111111111';
const presentationId = 'ec111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = 'ec222222-2222-4222-8222-222222222222';
const reportId = 'ec333333-3333-4333-8333-333333333333';

describe('GET /v1/establishments/{establishmentId}/prices (RF-008, #28)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  const observedAt = new Date(Date.now() - 60 * 60 * 1000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate comparison.price_current, reliability.observations, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz',
      brand: 'Diana',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda Don José',
      type: 'barrio',
      address: 'Cra. 14 # 20-10',
      lat: 4.535,
      lng: -75.6811,
    });
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId,
      priceCop: 2500,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const prices = (id = storeId) => request(server).get(`/v1/establishments/${id}/prices`);

  it('responde 200 con la tienda y sus precios, pública y con caché de 60 s', async () => {
    const response = await prices().expect(200);

    expect(response.headers['cache-control']).toBe(CACHE_PRICES);
    expect(response.body).toEqual({
      establishment: {
        id: storeId,
        name: 'Tienda Don José',
        type: 'barrio',
        address: 'Cra. 14 # 20-10',
        lat: 4.535,
        lng: -75.6811,
        municipality: 'armenia',
      },
      prices: [
        {
          productId,
          presentationId,
          productName: 'Arroz Diana · 500 g',
          reportId,
          priceCop: 2500,
          unitPrice: { valueCop: 500, per: '100g' },
          source: 'comunidad',
          freshness: 'vigente',
          // Sin observación en reliability (precio cargado a mano): cuenta como baja (#31).
          reliability: 'baja',
          confirmations: 0,
          observedAt: observedAt.toISOString(),
        },
      ],
    });
  });

  it('con If-None-Match igual al ETag responde 304', async () => {
    const first = await prices().expect(200);
    const etag = first.headers['etag'];

    expect(etag).toBeDefined();
    await prices()
      .set('If-None-Match', etag ?? '')
      .expect(304);
  });

  it('404 si la tienda no existe; 400 con un id que no es UUID o un onlyCurrent inválido', async () => {
    const responses = await Promise.all([
      prices('ec222222-2222-4222-8222-999999999999'),
      prices('tienda-1'),
      prices().query({ onlyCurrent: 'si' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 400, 400]);
  });
});
