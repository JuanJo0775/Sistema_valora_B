import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c1555555-5555-4555-8555-555555555555';
const productId = 'c1666666-6666-4666-8666-666666666666';
const riceId = 'c1666666-6666-4666-8666-aaaaaaaaaaaa';
const STORE = { lat: 4.5339, lng: -75.6811 };

describe('precios oficiales por HTTP (RF-016, #203)', () => {
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
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.official_prices, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de los oficiales',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: riceId, quantity: 500, unit: 'g', packCount: 1, barcode: '7702511999014' },
      ],
    });
    // Un comercio verificado: registra su tienda estando en ella (B1) y recibe el rol.
    merchant = await signIn(server, db, 'oficiales@correo.com');
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
    reporter = await signIn(server, db, 'reportante-oficiales@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate commerce.official_prices`);
  });

  const send = (method: 'put' | 'post', path: string, as: SignedIn | null, body?: object) => {
    const call = request(server)[method](`/v1${path}`);
    const signed = as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    return body === undefined ? signed : signed.send(body);
  };
  const publish = (as: SignedIn | null, body: object) => send('put', '/commerce/prices', as, body);
  const list = (as: SignedIn) =>
    request(server).get('/v1/commerce/prices').set('Cookie', as.cookie);

  it('200: publica el oficial de su tienda y lo ve en su lista, vigente', async () => {
    const response = await publish(merchant, { presentationId: riceId, priceCop: 2600 }).expect(
      200,
    );

    expect(response.body).toEqual({
      establishmentId: storeId,
      presentationId: riceId,
      priceCop: 2600,
      confirmedAt: expect.any(String) as unknown,
    });
    const mine = await list(merchant).expect(200).expect('Cache-Control', 'private, no-store');
    expect(mine.body).toEqual({ items: [{ ...(response.body as object), freshness: 'vigente' }] });
  });

  it('«Todos mis precios siguen igual» responde cuántos reconfirmó', async () => {
    await publish(merchant, { presentationId: riceId, priceCop: 2600 }).expect(200);

    const response = await send('post', '/commerce/prices/reconfirm', merchant).expect(200);

    expect(response.body).toEqual({ reconfirmed: 1 });
  });

  it('422 con una presentación que no existe o un precio absurdo; 400 con datos inválidos', async () => {
    const responses = await Promise.all([
      publish(merchant, { presentationId: 'c1999999-9999-4999-8999-999999999999', priceCop: 2600 }),
      publish(merchant, { presentationId: riceId, priceCop: 50 }),
      publish(merchant, { presentationId: riceId, priceCop: 'mil' }),
    ]);

    expect(responses.map((r) => [r.status, (r.body as { code: string }).code])).toEqual([
      [422, 'UNKNOWN_PRESENTATION'],
      [422, 'IMPLAUSIBLE_PRICE'],
      [400, 'VALIDATION_ERROR'],
    ]);
  });

  it('401 sin sesión; 403 un reportante o sin CSRF', async () => {
    const withoutCsrf = request(server)
      .put('/v1/commerce/prices')
      .set('Cookie', merchant.cookie)
      .send({ presentationId: riceId, priceCop: 2600 });

    const responses = await Promise.all([
      publish(null, { presentationId: riceId, priceCop: 2600 }),
      publish(reporter, { presentationId: riceId, priceCop: 2600 }),
      list(reporter),
      send('post', '/commerce/prices/reconfirm', reporter),
      withoutCsrf,
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 403, 403, 403, 403]);
  });

  describe('carga por archivo (D7, #205)', () => {
    const upload = (as: SignedIn | null, file: string) => {
      const call = request(server)
        .post('/v1/commerce/prices/bulk')
        .set('Content-Type', 'text/csv')
        .send(file);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };
    const lines = (...rows: string[]) => ['codigo_barras;precio', ...rows].join('\r\n');

    it('200: publica las filas buenas e informa las malas; repetir el archivo no duplica', async () => {
      const file = lines('7702511999014;2600', '9999999999999;3000');

      const first = await upload(merchant, file).expect(200);
      await upload(merchant, file).expect(200);

      expect(first.body).toEqual({
        published: 1,
        errors: [
          {
            row: 3,
            barcode: '9999999999999',
            code: 'UNKNOWN_BARCODE',
            message: expect.any(String) as unknown,
          },
        ],
      });
      const mine = await list(merchant).expect(200);
      expect((mine.body as { items: { priceCop: number }[] }).items).toEqual([
        expect.objectContaining({ presentationId: riceId, priceCop: 2600, freshness: 'vigente' }),
      ]);
    });

    it('400 sin el encabezado; 413 con más de 1.000 filas o de 1 MB; 401 sin sesión; 403 un reportante', async () => {
      const tooMany = lines(...Array.from({ length: 1001 }, (_, i) => `${String(i)};2600`));
      const tooBig = lines(`7702511999014;${'9'.repeat(1_100_000)}`);

      const responses = await Promise.all([
        upload(merchant, '7702511999014;2600'),
        upload(merchant, tooMany),
        upload(merchant, tooBig),
        upload(null, lines('7702511999014;2600')),
        upload(reporter, lines('7702511999014;2600')),
      ]);

      expect(responses.map((r) => [r.status, (r.body as { code?: string }).code])).toEqual([
        [400, 'VALIDATION_ERROR'],
        [413, 'PAYLOAD_TOO_LARGE'],
        [413, 'PAYLOAD_TOO_LARGE'],
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
      ]);
    });
  });
});
