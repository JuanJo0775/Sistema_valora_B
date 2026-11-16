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
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'c0111111-1111-4111-8111-111111111111';
const presentationId = 'c0111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = 'c0222222-2222-4222-8222-222222222222';
const missingId = 'c0999999-9999-4999-8999-999999999999';
const userLocation = { lat: '4.5339', lng: '-75.6811' };

// Grill de la #25, preguntas 2 y 3: las respuestas reales cumplen el contrato, en modo estricto.
describe('respuestas reales frente a docs/openapi.yaml (PR-09, #25)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let reporter: SignedIn;
  // Cada caso: la ruta como la nombra el contrato y la respuesta real.
  const checked: { route: string; status: number; body: unknown }[] = [];
  const check = async (route: string, call: request.Test): Promise<request.Response> => {
    const response = await call;
    checked.push({ route, status: response.status, body: response.body as unknown });
    return response;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references, establishments.establishments`,
    );
    reporter = await signIn(server, db, 'contrato@correo.com');
    const today = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const catalog = app.get(ImportCatalog);
    await catalog.save({
      id: productId,
      name: 'Arroz del contrato',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: ['Arroz de mesa'],
      image: {
        url: 'https://images.openfoodfacts.org/arroz.jpg',
        source: 'open_food_facts',
        attribution: 'Open Food Facts, CC BY-SA',
      },
      presentations: [
        { id: presentationId, quantity: 500, unit: 'g', packCount: 1, barcode: '7702511000014' },
      ],
    });
    await catalog.saveReference({
      id: 'c0333333-3333-4333-8333-000000000001',
      productId,
      sipsaName: 'Arroz blanco',
      market: 'Armenia, Retiro',
      periodStart: today,
      periodEnd: today,
      pricePerKgCop: 3200,
      sourceUrl: 'https://www.dane.gov.co/sipsa.xlsx',
      responsible: 'Integrante de prueba',
      consultedAt: today,
    });
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda del contrato',
      type: 'barrio',
      lat: 4.535,
      lng: -75.6811,
    });
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'c0444444-4444-4444-8444-000000000001',
      priceCop: 2500,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // La prueba vale si el validador de verdad rechaza lo que no cumple.
  it('detecta un campo que el contrato no nombra, un tipo equivocado y una respuesta sin documentar', () => {
    const product = {
      id: productId,
      name: 'Arroz',
      category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
      presentations: [],
    };

    expect(contractErrors('GET /products/:productId', 200, product)).toEqual([]);
    expect(
      contractErrors('GET /products/:productId', 200, {
        ...product,
        reporterEmail: 'x@correo.com',
      }),
    ).toEqual([
      'GET /products/:productId 200: (raíz) must NOT have additional properties (reporterEmail)',
    ]);
    expect(contractErrors('GET /products/:productId', 200, { ...product, name: 7 })).toEqual([
      'GET /products/:productId 200: /name must be string',
    ]);
    expect(contractErrors('GET /products/:productId', 418, product)).toEqual([
      'GET /products/:productId no documenta la respuesta 418',
    ]);
  });

  it('las rutas públicas responden como dice el contrato', async () => {
    const get = (path: string) => request(server).get(`/v1${path}`);

    await check('GET /health', get('/health'));
    await check('GET /categories', get('/categories'));
    await check('GET /products', get('/products').query({ q: 'arroz' }));
    await check('GET /products', get('/products').query({ barcode: '7702511000014' }));
    await check('GET /products', get('/products'));
    await check('GET /products/:productId', get(`/products/${productId}`));
    await check('GET /products/:productId', get(`/products/${missingId}`));
    await check(
      'GET /products/:productId/comparison',
      get(`/products/${productId}/comparison`).query(userLocation),
    );
    await check('GET /products/:productId/comparison', get(`/products/${productId}/comparison`));
    await check(
      'GET /products/:productId/comparison',
      get(`/products/${missingId}/comparison`).query(userLocation),
    );
    await check('GET /products/:productId/history', get(`/products/${productId}/history`));
    await check('GET /establishments/nearby', get('/establishments/nearby').query(userLocation));
    await check(
      'GET /establishments/:establishmentId/prices',
      get(`/establishments/${storeId}/prices`),
    );
    await check(
      'GET /establishments/:establishmentId/prices',
      get(`/establishments/${missingId}/prices`),
    );

    const statuses = checked.map(({ status }) => status);
    expect(statuses).toEqual([
      200, 200, 200, 200, 400, 200, 404, 200, 400, 404, 200, 200, 200, 404,
    ]);
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });

  it('registrar un precio, reintentarlo y sus errores responden como dice el contrato', async () => {
    checked.length = 0;
    const report = {
      presentationId,
      establishmentId: storeId,
      priceCop: 2600,
      observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const post = (as: SignedIn | null, payload: object, key: string) => {
      const call = request(server).post('/v1/reports').set('Idempotency-Key', key).send(payload);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };
    const key = 'c0555555-5555-4555-8555-000000000001';

    await check('POST /reports', post(reporter, report, key));
    await check('POST /reports', post(reporter, report, key));
    await check('POST /reports', post(reporter, { ...report, priceCop: 0 }, crypto.randomUUID()));
    await check('POST /reports', post(null, report, crypto.randomUUID()));
    await check(
      'POST /reports',
      post(reporter, { ...report, priceCop: 2700 }, crypto.randomUUID()),
    );
    await check(
      'GET /auth/session',
      request(server).get('/v1/auth/session').set('Cookie', reporter.cookie),
    );
    await check(
      'GET /me/reports',
      request(server).get('/v1/me/reports').set('Cookie', reporter.cookie),
    );

    expect(checked.map(({ status }) => status)).toEqual([201, 200, 400, 401, 409, 200, 200]);
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });
});
