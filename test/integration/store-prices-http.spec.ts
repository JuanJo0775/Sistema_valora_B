import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { CACHE_PRICES } from '../../src/shared/http/cache-control';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import {
  officialPrices,
  priceCurrent,
  promotions,
} from '../../src/modules/comparison/infrastructure/schema';
import {
  onMerchantGone,
  onMerchantVerified,
} from '../../src/modules/comparison/infrastructure/verified-merchant-handlers';
import { createEvent } from '../../src/shared/events';
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
      sql`truncate comparison.price_current, comparison.official_prices, comparison.promotions, comparison.verified_merchants, reliability.observations, catalog.presentations, catalog.products, establishments.establishments`,
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
      verifiedMerchant: false,
      promotions: [],
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

  it('dice que la tienda tiene un comercio verificado mientras no se revoque ni se deje (H6)', async () => {
    const accountId = 'ec444444-4444-4444-8444-444444444444';
    const event = (type: string) => createEvent(type, 1, { accountId, establishmentId: storeId });
    await db.transaction((tx) => onMerchantVerified(event('MerchantVerified'), tx));
    expect((await prices().expect(200)).body).toMatchObject({ verifiedMerchant: true });
    // La respuesta pública nunca lleva la cuenta (EC-08).
    expect(JSON.stringify((await prices().expect(200)).body)).not.toContain(accountId);

    await db.transaction((tx) => onMerchantGone(event('MerchantRevoked'), tx));
    expect((await prices().expect(200)).body).toMatchObject({ verifiedMerchant: false });
  });

  it('muestra la promoción activa aparte de los precios, con el «antes» y el precio con ella (H6)', async () => {
    const day = 24 * 60 * 60 * 1000;
    const date = (offsetDays: number) =>
      new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
    await db.insert(officialPrices).values({
      presentationId,
      establishmentId: storeId,
      priceCop: 2600,
      confirmedAt: new Date(),
      priceChangedAt: new Date(),
    });
    await db.insert(promotions).values({
      id: 'ec555555-5555-4555-8555-555555555555',
      establishmentId: storeId,
      presentationId,
      offer: { type: 'descuento_porcentual', percent: 10 },
      conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
      validFrom: date(-3),
      validUntil: date(3),
    });
    try {
      const body = (await prices().expect(200)).body as { promotions: unknown[] };
      expect(body.promotions).toEqual([
        {
          id: 'ec555555-5555-4555-8555-555555555555',
          presentationId,
          productName: 'Arroz Diana · 500 g',
          type: 'descuento_porcentual',
          percent: 10,
          conditions: { whileStocksLast: false, paymentMethod: 'cualquiera' },
          validFrom: date(-3),
          validUntil: date(3),
          officialPriceCop: 2600,
          promotedPriceCop: 2340,
        },
      ]);
    } finally {
      await db.execute(sql`truncate comparison.official_prices, comparison.promotions`);
    }
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
