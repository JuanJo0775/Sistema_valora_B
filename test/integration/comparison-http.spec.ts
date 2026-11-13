import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Producto, presentación y tienda de prueba: solo existen dentro de esta prueba.
const productId = 'a7777777-7777-4777-8777-111111111111';
const presentationId = 'a7777777-7777-4777-8777-aaaaaaaaaaaa';
const storeId = 'a8888888-8888-4888-8888-111111111111';
// Punto de consulta en el centro de Armenia; la tienda está unos 120 m al norte.
const userLocation = { lat: '4.5339', lng: '-75.6811' };

describe('GET /v1/products/{productId}/comparison', () => {
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
      sql`truncate comparison.price_current, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda de prueba',
      type: 'barrio',
      lat: 4.535,
      lng: -75.6811,
    });
  });

  const compare = (query: Record<string, string> = userLocation, id = productId) =>
    request(server).get(`/v1/products/${id}/comparison`).query(query);

  it('responde 200 con la forma del contrato y Cache-Control no-store', async () => {
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'a9999999-9999-4999-8999-999999999999',
      priceCop: 2000,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });

    const response = await compare().expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      productId,
      criteria: { sort: 'unit_price', radiusKm: 2 },
      results: [
        {
          establishment: {
            id: storeId,
            name: 'Tienda de prueba',
            type: 'barrio',
            lat: 4.535,
            lng: -75.6811,
            distanceM: expect.closeTo(122, -1) as unknown,
          },
          presentationId,
          priceCop: 2000,
          unitPrice: { valueCop: 400, per: '100g' },
          source: 'comunidad',
          freshness: 'vigente',
          isCheapest: true,
          observedAt: observedAt.toISOString(),
        },
      ],
      promotions: [],
    });
  });

  it.each([
    ['un productId que no es UUID', userLocation, 'producto-1', 'productId: debe ser un UUID'],
    ['sin lat', { lng: userLocation.lng }, productId, 'lat: debe estar entre -90 y 90'],
    [
      'con radiusKm 5',
      { ...userLocation, radiusKm: '5' },
      productId,
      'radiusKm: debe estar entre 0,5 y 3',
    ],
    [
      'con un sort desconocido',
      { ...userLocation, sort: 'promoted' },
      productId,
      'sort: debe ser unit_price, distance o recent',
    ],
    [
      'con onlyCurrent que no es booleano',
      { ...userLocation, onlyCurrent: 'si' },
      productId,
      'onlyCurrent: debe ser true o false',
    ],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, query, id, message) => {
    const response = await compare(query, id).expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
  });

  it('un producto que no existe responde 404', async () => {
    const response = await compare(userLocation, 'a7777777-7777-4777-8777-999999999999').expect(
      404,
    );

    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Recurso no encontrado.' });
  });
});
