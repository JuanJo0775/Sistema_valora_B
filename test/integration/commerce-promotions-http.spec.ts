import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { colombiaDate } from '../../src/domain/colombia-date';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c7555555-5555-4555-8555-555555555555';
const productId = 'c7666666-6666-4666-8666-666666666666';
const riceId = 'c7666666-6666-4666-8666-aaaaaaaaaaaa';
const oilId = 'c7666666-6666-4666-8666-bbbbbbbbbbbb';
const STORE = { lat: 4.5339, lng: -75.6811 };
const DAY = 24 * 60 * 60 * 1000;
const today = colombiaDate(new Date());
const inDays = (days: number) => colombiaDate(new Date(Date.now() + days * DAY));

// D6 del grill comercial (#206), de punta a punta: commerce → outbox → comparison.
describe('promociones por HTTP (RF-017, #206)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let merchant: SignedIn;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.official_prices, commerce.promotions, comparison.official_prices, comparison.promotions, comparison.price_current, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de las promociones',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: riceId, quantity: 500, unit: 'g', packCount: 1 },
        { id: oilId, quantity: 1000, unit: 'g', packCount: 1 },
      ],
    });
    merchant = await signIn(server, db, 'comercio-promociones@correo.com');
    await request(server)
      .post('/v1/commerce/claims')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({
        establishmentId: storeId,
        responsibleName: 'Rosa Gómez',
        phone: '3001234567',
        acceptedTermsVersion: '2026-11',
        location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
      })
      .expect(201);
    await app.get(OutboxRelay).runOnce();
    await request(server)
      .put('/v1/commerce/prices')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({ presentationId: riceId, priceCop: 2600 })
      .expect(200);
    reporter = await signIn(server, db, 'reportante-promociones@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (as: SignedIn | null, method: 'post' | 'delete', path: string, body?: object) => {
    const call = request(server)[method](`/v1${path}`);
    const signed = as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    return body === undefined ? signed : signed.send(body);
  };
  const promotion = (change: object = {}) => ({
    presentationId: riceId,
    type: 'descuento_porcentual',
    percent: 20,
    conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
    validFrom: today,
    validUntil: inDays(7),
    ...change,
  });
  const compare = () =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ lat: String(STORE.lat), lng: String(STORE.lng) });

  it('201: publica sobre el oficial vigente, sale en la comparación aparte de los resultados y al retirarla desaparece', async () => {
    const created = await send(merchant, 'post', '/commerce/promotions', promotion()).expect(201);
    const { id } = created.body as { id: string };
    await app.get(OutboxRelay).runOnce();

    expect(created.body).toMatchObject({
      establishmentId: storeId,
      type: 'descuento_porcentual',
      percent: 20,
      status: 'activa',
      officialPriceCop: 2600,
      promotedPriceCop: 2080,
    });
    const mine = await request(server)
      .get('/v1/commerce/promotions')
      .set('Cookie', merchant.cookie)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    const withPromotion = await compare().expect(200);
    expect(withPromotion.body).toMatchObject({
      results: [{ priceCop: 2600, source: 'oficial' }],
      promotions: [{ id, establishment: { id: storeId }, promotedPriceCop: 2080 }],
    });
    expect([
      ...contractErrors('POST /commerce/promotions', 201, created.body as unknown),
      ...contractErrors('GET /commerce/promotions', 200, mine.body as unknown),
      ...contractErrors('GET /products/:productId/comparison', 200, withPromotion.body as unknown),
    ]).toEqual([]);

    await send(merchant, 'delete', `/commerce/promotions/${id}`).expect(204);
    await app.get(OutboxRelay).runOnce();

    const withdrawn = await compare().expect(200);
    expect((withdrawn.body as { promotions: unknown[] }).promotions).toEqual([]);
    expect((withdrawn.body as { results: unknown }).results).toEqual(
      (withPromotion.body as { results: unknown }).results,
    );
  });

  it('422 sin oficial o fuera de los límites; 400 con datos inválidos; 404 al retirar una que no existe', async () => {
    const responses = await Promise.all([
      send(merchant, 'post', '/commerce/promotions', promotion({ presentationId: oilId })),
      send(merchant, 'post', '/commerce/promotions', promotion({ validUntil: inDays(40) })),
      send(merchant, 'post', '/commerce/promotions', promotion({ percent: undefined })),
      send(
        merchant,
        'post',
        '/commerce/promotions',
        promotion({ conditions: { paymentMethod: 'cheque', whileStocksLast: true } }),
      ),
      send(merchant, 'delete', '/commerce/promotions/c7999999-9999-4999-8999-999999999999'),
    ]);

    expect(responses.map((r) => [r.status, (r.body as { code?: string }).code])).toEqual([
      [422, 'OFFICIAL_PRICE_REQUIRED'],
      [422, 'INVALID_PROMOTION'],
      [400, 'VALIDATION_ERROR'],
      [400, 'VALIDATION_ERROR'],
      [404, 'NOT_FOUND'],
    ]);
  });

  it('401 sin sesión; 403 un reportante', async () => {
    const responses = await Promise.all([
      send(null, 'post', '/commerce/promotions', promotion()),
      send(reporter, 'post', '/commerce/promotions', promotion()),
      request(server).get('/v1/commerce/promotions').set('Cookie', reporter.cookie),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 403, 403]);
  });
});
