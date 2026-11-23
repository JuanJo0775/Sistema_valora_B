import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { OutboxRelay } from '../../src/shared/events';
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
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references, establishments.establishments`,
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
      address: 'Cra. 14 # 20-30',
      neighborhood: 'Centro',
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
    await check(
      'GET /featured-products',
      get('/featured-products').query({ municipality: 'armenia' }),
    );
    await check('GET /featured-products', get('/featured-products'));
    // B#128: con la ubicación, la más barata trae su distancia.
    await check('GET /featured-products', get('/featured-products').query(userLocation));
    // Paginación por desplazamiento: una página intermedia y los 400 de offset y limit.
    await check(
      'GET /featured-products',
      get('/featured-products').query({ municipality: 'armenia', limit: 1, offset: 1 }),
    );
    await check(
      'GET /featured-products',
      get('/featured-products').query({ municipality: 'armenia', offset: -1 }),
    );
    await check(
      'GET /featured-products',
      get('/featured-products').query({ municipality: 'armenia', limit: 51 }),
    );
    await check('GET /establishments/nearby', get('/establishments/nearby').query(userLocation));
    await check('GET /establishments', get('/establishments').query({ municipality: 'armenia' }));
    await check('GET /establishments', get('/establishments'));
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
      200, 200, 200, 200, 400, 200, 404, 200, 400, 404, 200, 200, 400, 200, 200, 400, 400, 200, 200,
      400, 200, 404,
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
    // reliability evalúa el reporte por el outbox; después aparece en «Mis aportes» con su productId.
    await app.get(OutboxRelay).runOnce();
    const mine = await check(
      'GET /me/reports',
      request(server).get('/v1/me/reports').set('Cookie', reporter.cookie),
    );
    expect((mine.body as { items: { productId?: string }[] }).items[0]?.productId).toBe(productId);

    expect(checked.map(({ status }) => status)).toEqual([201, 200, 400, 401, 409, 200, 200]);
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });

  // ADR-029: la verificación de correo y el 403 de /reports responden como dice el contrato.
  it('verificar el correo, reenviarlo y exigirlo para reportar responden como dice el contrato', async () => {
    checked.length = 0;
    const unverified = await signIn(
      server,
      db,
      'sin-verificar-contrato@correo.com',
      'reportante',
      undefined,
      false,
    );
    const token = 'token-del-contrato-0123456789abcdefghijklmnopq';
    const resend = (as: SignedIn | null) => {
      const call = request(server).post('/v1/auth/resend-verification');
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };

    await check(
      'POST /reports',
      request(server)
        .post('/v1/reports')
        .set('Cookie', unverified.cookie)
        .set('X-CSRF-Token', unverified.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          presentationId,
          establishmentId: storeId,
          priceCop: 2600,
          observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        }),
    );
    await check(
      'GET /auth/session',
      request(server).get('/v1/auth/session').set('Cookie', unverified.cookie),
    );
    await check('POST /auth/verify-email', request(server).post('/v1/auth/verify-email').send({}));
    await check(
      'POST /auth/verify-email',
      request(server).post('/v1/auth/verify-email').send({ token: 'no-existe' }),
    );
    await check('POST /auth/resend-verification', resend(null));
    await check('POST /auth/resend-verification', resend(unverified));
    await check('POST /auth/resend-verification', resend(unverified));
    await check('POST /auth/resend-verification', resend(unverified));
    await check('POST /auth/resend-verification', resend(unverified));
    // El reenvío invalidó los enlaces anteriores: se guarda uno propio para probar el 204.
    await db.execute(
      sql`delete from identity.email_verifications where account_id = ${unverified.accountId}`,
    );
    await db.execute(
      sql`insert into identity.email_verifications (id, account_id, token_hash, created_at, expires_at)
          values (${crypto.randomUUID()}, ${unverified.accountId}, ${createHash('sha256').update(token).digest('hex')}, now(), now() + interval '1 hour')`,
    );
    await check(
      'POST /auth/verify-email',
      request(server).post('/v1/auth/verify-email').send({ token }),
    );
    await check(
      'GET /auth/session',
      request(server).get('/v1/auth/session').set('Cookie', unverified.cookie),
    );

    expect(checked.map(({ status }) => status)).toEqual([
      403, 200, 400, 422, 401, 202, 202, 202, 429, 204, 200,
    ]);
    expect(checked[0]?.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(checked[1]?.body).toMatchObject({ emailVerified: false });
    expect(checked[10]?.body).toMatchObject({ emailVerified: true });
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });

  // ADR-032: la eliminación de la cuenta con gracia de 10 días, el login de una cuenta pendiente y la
  // restauración responden como dice el contrato.
  it('eliminar la cuenta, iniciar sesión estando pendiente y restaurarla responden como dice el contrato', async () => {
    checked.length = 0;
    const me = await signIn(server, db, 'eliminar-contrato@correo.com');
    const other = await signIn(server, db, 'intentos-contrato@correo.com');
    const password = 'una-clave-larga';
    const withSession = (as: SignedIn | null, body: object) => {
      const call = request(server).post('/v1/me/account-deletion');
      return (as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call).send(
        body,
      );
    };
    const credentials = (email: string, pass: string) => ({ email, password: pass });

    await check('POST /me/account-deletion', withSession(null, { password }));
    await check('POST /me/account-deletion', withSession(me, {}));
    await check('POST /me/account-deletion', withSession(me, { password: 'otra-clave-larga' }));
    await check('POST /me/account-deletion', withSession(me, { password }));
    await check(
      'POST /auth/login',
      request(server)
        .post('/v1/auth/login')
        .send(credentials('eliminar-contrato@correo.com', password)),
    );
    await check(
      'POST /auth/restore-account',
      request(server)
        .post('/v1/auth/restore-account')
        .send(credentials('eliminar-contrato@correo.com', 'otra-clave-larga')),
    );
    await check(
      'POST /auth/restore-account',
      request(server)
        .post('/v1/auth/restore-account')
        .send(credentials('eliminar-contrato@correo.com', password)),
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await check(
        'POST /me/account-deletion',
        withSession(other, { password: 'otra-clave-larga' }),
      );
    }
    await check('POST /me/account-deletion', withSession(other, { password }));

    expect(checked.map(({ status }) => status)).toEqual([
      401, 400, 403, 202, 403, 401, 204, 403, 403, 403, 403, 403, 429,
    ]);
    expect(checked[2]?.body).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(checked[4]?.body).toMatchObject({ code: 'ACCOUNT_PENDING_DELETION' });
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });

  // ADR-033: olvidé mi contraseña, restablecerla y cambiarla responden como dice el contrato.
  it('olvidar, restablecer y cambiar la contraseña responden como dice el contrato', async () => {
    checked.length = 0;
    const me = await signIn(server, db, 'clave-contrato@correo.com');
    const google = await signIn(server, db, 'google-contrato@correo.com');
    await db.execute(
      sql`update identity.accounts set password_hash = null where email = 'google-contrato@correo.com'`,
    );
    const token = 'token-de-clave-0123456789abcdefghijklmnopqrstu';
    const withSession = (as: SignedIn | null, body: object) => {
      const call = request(server).post('/v1/me/password');
      return (as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call).send(
        body,
      );
    };
    const forgot = (email: string) =>
      request(server).post('/v1/auth/forgot-password').send({ email });
    const reset = (body: object) => request(server).post('/v1/auth/reset-password').send(body);

    await check('POST /auth/forgot-password', forgot('clave-contrato@correo.com'));
    await check('POST /auth/forgot-password', forgot('nadie@correo.com'));
    await check('POST /auth/forgot-password', forgot('no-es-un-correo'));
    await check('POST /auth/reset-password', reset({}));
    await check(
      'POST /auth/reset-password',
      reset({ token: 'no-existe', password: 'una-clave-nueva-larga' }),
    );
    // El enlace real llegó por correo: aquí se guarda uno propio para probar el 204.
    await db.execute(sql`delete from identity.password_resets`);
    await db.execute(
      sql`insert into identity.password_resets (id, account_id, token_hash, created_at, expires_at)
          values (${crypto.randomUUID()}, ${me.accountId}, ${createHash('sha256').update(token).digest('hex')}, now(), now() + interval '1 hour')`,
    );
    await check('POST /auth/reset-password', reset({ token, password: 'una-clave-nueva-larga' }));
    const again = await signIn(server, db, 'otra-clave-contrato@correo.com');
    await check('POST /me/password', withSession(null, { newPassword: 'una-clave-nueva-larga' }));
    await check('POST /me/password', withSession(again, { newPassword: 'corta' }));
    await check(
      'POST /me/password',
      withSession(again, {
        currentPassword: 'otra-clave-larga',
        newPassword: 'una-clave-nueva-larga',
      }),
    );
    await check(
      'POST /me/password',
      withSession(again, {
        currentPassword: 'una-clave-larga',
        newPassword: 'una-clave-nueva-larga',
      }),
    );
    await check(
      'GET /auth/session',
      request(server).get('/v1/auth/session').set('Cookie', google.cookie),
    );
    await db.execute(
      sql`update identity.sessions set created_at = now() - interval '11 minutes' where account_id = ${google.accountId}`,
    );
    await check('POST /me/password', withSession(google, { newPassword: 'una-clave-nueva-larga' }));
    await db.execute(
      sql`update identity.sessions set created_at = now() where account_id = ${google.accountId}`,
    );
    await check('POST /me/password', withSession(google, { newPassword: 'una-clave-nueva-larga' }));
    for (let i = 0; i < 3; i += 1)
      await check('POST /auth/forgot-password', forgot(`rate${String(i)}@correo.com`));
    await check('POST /auth/forgot-password', forgot('rate-final@correo.com'));

    expect(checked.map(({ status }) => status)).toEqual([
      202, 202, 400, 400, 422, 204, 401, 400, 403, 204, 200, 403, 204, 202, 202, 202, 429,
    ]);
    expect(checked[4]?.body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(checked[10]?.body).toMatchObject({ hasPassword: false });
    expect(checked[11]?.body).toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(
      checked.flatMap(({ route, status, body }) => contractErrors(route, status, body)),
    ).toEqual([]);
  });
});
