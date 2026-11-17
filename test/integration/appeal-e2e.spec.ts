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

// Producto, presentación y tienda de prueba: solo existen dentro de esta prueba.
const productId = 'a7777777-7777-4777-8777-222222222222';
const presentationId = 'a7777777-7777-4777-8777-bbbbbbbbbbbb';
const storeId = 'a8888888-8888-4888-8888-222222222222';
// Grill de la #29: una cuenta no reporta la misma presentación en la misma tienda dos veces en una
// hora. Los primeros reportes de Beto van a tiendas a unos 5 km, fuera del radio de la comparación.
const farStores = ['a8888888-8888-4888-8888-333333333333', 'a8888888-8888-4888-8888-444444444444'];
const userLocation = { lat: '4.5339', lng: '-75.6811' };

// Archivo propio: los límites de registro e inicio de sesión cuentan por IP y viven en memoria.
describe('apelación de punta a punta (RF-013 RN4, #71)', () => {
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
    await db.execute(
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    for (const [index, id] of farStores.entries()) {
      await app.get(ImportEstablishments).save({
        id,
        name: `Tienda lejana ${String(index)}`,
        type: 'barrio',
        lat: 4.58 + index * 0.001,
        lng: -75.6811,
      });
    }
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda de prueba',
      type: 'barrio',
      lat: 4.535,
      lng: -75.6811,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const compare = () =>
    request(server).get(`/v1/products/${productId}/comparison`).query(userLocation);

  it('el autor suspendido apela con su sesión limitada, otra moderadora acepta y su precio vuelve', async () => {
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    const relay = app.get(OutboxRelay);
    const ana = await signIn(server, db, 'ana@correo.com');
    const beto = await signIn(server, db, 'beto@correo.com');
    const moderatorA = await signIn(server, db, 'moderadora-a@correo.com', 'moderador');
    const moderatorB = await signIn(server, db, 'moderadora-b@correo.com', 'moderador');
    const post = (as: SignedIn, path: string, body: object, headers: Record<string, string> = {}) =>
      request(server)
        .post(path)
        .set('Cookie', as.cookie)
        .set('X-CSRF-Token', as.csrfToken)
        .set(headers)
        .send(body);
    const reportAs = async (
      as: SignedIn,
      priceCop: number,
      minutesAgo: number,
      establishmentId = storeId,
    ) => {
      const receipt = await post(
        as,
        '/v1/reports',
        {
          presentationId,
          establishmentId,
          priceCop,
          observedAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      ).expect(201);
      await relay.runOnce();
      await relay.runOnce();
      return (receipt.body as { id: string }).id;
    };
    const shownPrice = async () =>
      ((await compare().expect(200)).body as { results: { priceCop: number }[] }).results[0]
        ?.priceCop;

    await reportAs(ana, 4000, 120);
    const betoReports = [
      await reportAs(beto, 2600, 50, farStores[0]),
      await reportAs(beto, 2550, 40, farStores[1]),
      await reportAs(beto, 2500, 30),
    ];
    expect(await shownPrice()).toBe(2500);
    const decision = { note: 'Precio que no coincide con la tienda' };
    for (const reportId of betoReports) {
      await post(ana, `/v1/reports/${reportId}/flag`, { reason: 'precio_falso' }).expect(202);
      await post(moderatorA, `/v1/moderation/${reportId}/decision`, {
        ...decision,
        decision: 'descartar',
      }).expect(204);
    }
    await relay.runOnce();
    expect(await shownPrice()).toBe(4000);

    // Beto quedó suspendido: entra con una sesión limitada.
    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: 'beto@correo.com', password: 'una-clave-larga' })
      .expect(204);
    const [setCookie] = login.headers['set-cookie'] as unknown as string[];
    const cookie = (setCookie ?? '').split(';')[0] ?? '';
    const session = await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(200);
    const limited: SignedIn = {
      cookie,
      csrfToken: (session.body as { csrfToken: string }).csrfToken,
      accountId: beto.accountId,
    };
    expect(session.body).toHaveProperty('suspendedUntil');
    const last = betoReports[2] ?? '';
    await post(limited, `/v1/reports/${last}/appeal`, {
      note: 'El precio sí era ese, está en la etiqueta',
    }).expect(202);

    await post(moderatorB, `/v1/moderation/${last}/decision`, {
      ...decision,
      decision: 'aprobar',
    }).expect(204);
    await relay.runOnce();

    expect(await shownPrice()).toBe(2500);
    const status = await request(server)
      .get(`/v1/me/reports/${last}/status`)
      .set('Cookie', cookie)
      .expect(200);
    expect(status.body).toEqual({ reportId: last, status: 'apelacion_aceptada' });
    const after = await request(server).get('/v1/auth/session').set('Cookie', cookie).expect(200);
    expect(after.body).not.toHaveProperty('suspendedUntil');
    // EC-08: el autor no ve quién decidió ni quién marcó.
    expect(JSON.stringify([status.body, after.body])).not.toContain('moderadora');
  });
});
