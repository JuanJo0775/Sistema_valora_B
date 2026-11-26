import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { OlimpicaObservations, ONLINE_OFFERS_ENABLED } from '../../src/modules/imports';
import { VAPID_PUBLIC_KEY } from '../../src/modules/notifications';
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
  let onlineOffersEnabled = false;
  // Cada caso: la ruta como la nombra el contrato y la respuesta real.
  const checked: { route: string; status: number; body: unknown }[] = [];
  const check = async (route: string, call: request.Test): Promise<request.Response> => {
    const response = await call;
    checked.push({ route, status: response.status, body: response.body as unknown });
    return response;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ONLINE_OFFERS_ENABLED)
      .useValue(() => onlineOffersEnabled)
      .overrideProvider(VAPID_PUBLIC_KEY)
      .useValue('B' + 'A'.repeat(86))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate imports.online_observations, identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references, establishments.establishments`,
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

  it('devuelve una lista vacía conforme al contrato cuando el piloto está inactivo', async () => {
    const response = await request(server)
      .get(`/v1/products/${productId}/online-offers`)
      .query({ zone: 'armenia-centro' });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ items: [] });
    expect(
      contractErrors('GET /products/:productId/online-offers', 200, response.body as unknown),
    ).toEqual([]);
  });

  // #257: el contador de moderación cumple el contrato, también sus errores.
  it('el resumen de pendientes de moderación cumple el contrato (#257)', async () => {
    const moderator = await signIn(server, db, 'contrato-resumen@correo.com', 'moderador');
    const summary = (cookie?: string) => {
      const call = request(server).get('/v1/moderation/summary');
      return cookie ? call.set('Cookie', cookie) : call;
    };

    const ok = await summary(moderator.cookie);
    const withoutSession = await summary();
    const asReporter = await summary(reporter.cookie);

    expect([ok.status, withoutSession.status, asReporter.status]).toEqual([200, 401, 403]);
    expect(Object.keys(ok.body as object).sort()).toEqual([
      'comercios',
      'precios',
      'productos',
      'tiendas',
    ]);
    for (const response of [ok, withoutSession, asReporter]) {
      expect(
        contractErrors('GET /moderation/summary', response.status, response.body as unknown),
      ).toEqual([]);
    }
  });

  // #259: las rutas de los avisos push cumplen el contrato, también sus errores.
  it('las rutas de suscripción a los avisos cumplen el contrato (#259)', async () => {
    const moderator = await signIn(server, db, 'contrato-avisos@correo.com', 'moderador');
    const body = {
      endpoint: 'https://push.example.net/contrato',
      keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
    };
    const subscribe = (as: SignedIn | null, payload: object = body) => {
      const call = request(server).post('/v1/notifications/subscriptions').send(payload);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };

    const unsubscribe = (as: SignedIn | null, payload: object = { endpoint: body.endpoint }) => {
      const call = request(server).delete('/v1/notifications/subscriptions').send(payload);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };

    const key = await request(server).get('/v1/notifications/vapid-public-key');
    const ok = await subscribe(moderator);
    const invalid = await subscribe(moderator, { endpoint: 'http://push.example.net/x' });
    const withoutSession = await subscribe(null);
    const asReporter = await subscribe(reporter);
    const removed = await unsubscribe(moderator);
    const removedInvalid = await unsubscribe(moderator, { endpoint: 'http://push.example.net/x' });
    const removedWithoutSession = await unsubscribe(null);
    const removedAsReporter = await unsubscribe(reporter);

    expect(
      [
        key,
        ok,
        invalid,
        withoutSession,
        asReporter,
        removed,
        removedInvalid,
        removedWithoutSession,
        removedAsReporter,
      ].map(({ status }) => status),
    ).toEqual([200, 204, 400, 401, 403, 204, 400, 401, 403]);
    const routes = [
      ['GET /notifications/vapid-public-key', key],
      ['POST /notifications/subscriptions', ok],
      ['POST /notifications/subscriptions', invalid],
      ['POST /notifications/subscriptions', withoutSession],
      ['POST /notifications/subscriptions', asReporter],
      ['DELETE /notifications/subscriptions', removed],
      ['DELETE /notifications/subscriptions', removedInvalid],
      ['DELETE /notifications/subscriptions', removedWithoutSession],
      ['DELETE /notifications/subscriptions', removedAsReporter],
    ] as const;
    for (const [route, response] of routes) {
      expect(contractErrors(route, response.status, response.body as unknown)).toEqual([]);
    }
  });

  it('expone la oferta sintética vigente y la retira si vence o queda sin stock', async () => {
    onlineOffersEnabled = true;
    const observations = new OlimpicaObservations(db);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const base = {
      source: 'olimpica_vtex' as const,
      zoneId: 'armenia-centro',
      presentationId,
      ean: '7702511000014',
      skuId: 'sku-sintetico',
      sellerId: '1',
    };
    const getOffers = () =>
      request(server).get(`/v1/products/${productId}/online-offers`).query({ zone: base.zoneId });
    try {
      await observations.save({
        ...base,
        runId: randomUUID(),
        status: 'available',
        observedAt: new Date(now - 3 * day),
        expiresAt: new Date(now - day),
        priceCop: 3400,
      });
      expect((await getOffers().expect(200)).body).toEqual({ items: [] });

      const observedAt = new Date(now - 1000);
      const expiresAt = new Date(observedAt.getTime() + 2 * day);
      await observations.save({
        ...base,
        runId: randomUUID(),
        status: 'available',
        observedAt,
        expiresAt,
        priceCop: 3456,
      });
      const response = await getOffers().expect(200);
      expect(response.body).toEqual({
        items: [
          {
            presentationId,
            source: 'olimpica',
            zone: base.zoneId,
            priceCop: 3456,
            observedAt: observedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        ],
      });
      expect(
        contractErrors('GET /products/:productId/online-offers', 200, response.body as unknown),
      ).toEqual([]);

      await observations.save({
        ...base,
        runId: randomUUID(),
        status: 'unavailable',
        observedAt: new Date(now),
      });
      expect((await getOffers().expect(200)).body).toEqual({ items: [] });
    } finally {
      onlineOffersEnabled = false;
    }
  });

  it.each([
    [productId, 'otra-zona', 400],
    ['id-invalido', 'armenia-centro', 400],
    [missingId, 'armenia-centro', 404],
  ])('valida producto %s y zona %s en ofertas en línea', async (id, zone, status) => {
    const response = await request(server).get(`/v1/products/${id}/online-offers`).query({ zone });
    expect(response.status).toBe(status);
    expect(
      contractErrors('GET /products/:productId/online-offers', status, response.body as unknown),
    ).toEqual([]);
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

  // Rectificación del nombre visible: la ruta responde como dice el contrato.
  it('cambiar el nombre visible responde como dice el contrato', async () => {
    checked.length = 0;
    const me = await signIn(server, db, 'nombre-contrato@correo.com');
    const withSession = (as: SignedIn | null, body: object) => {
      const call = request(server).patch('/v1/me/profile');
      return (as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call).send(
        body,
      );
    };

    await check('PATCH /me/profile', withSession(null, { displayName: 'Sara Luz' }));
    await check('PATCH /me/profile', withSession(me, { displayName: '3001234567' }));
    await check('PATCH /me/profile', withSession(me, { displayName: ' Sara   Luz ' }));
    await check(
      'PATCH /me/profile',
      request(server)
        .patch('/v1/me/profile')
        .set('Cookie', me.cookie)
        .send({ displayName: 'Sara Luz' }),
    );
    for (let i = 0; i < 9; i += 1) {
      await check('PATCH /me/profile', withSession(me, { displayName: 'Sara Luz' }));
    }

    // 10 cambios aceptados (el 3.º y los 9 del ciclo) y el siguiente, el 11.º, se frena.
    expect(checked.map(({ status }) => status)).toEqual([
      401, 400, 200, 403, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ]);
    await check('PATCH /me/profile', withSession(me, { displayName: 'Sara Luz' }));
    expect(checked.at(-1)?.status).toBe(429);
    expect(checked[2]?.body).toEqual({ displayName: 'Sara Luz' });
    expect(checked[3]?.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
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
