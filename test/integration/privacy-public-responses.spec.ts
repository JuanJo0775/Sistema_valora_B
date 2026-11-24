import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { ReporterIdentity } from '../../src/modules/identity';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'ed111111-1111-4111-8111-111111111111';
const presentationId = 'ed111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = 'ed222222-2222-4222-8222-222222222222';
// Ubicación consultada por el usuario, con cifras que no coinciden con la de la tienda.
const userLocation = { lat: '4.5301', lng: '-75.6799' };

// EC-08 (grill de la #36, pregunta 2): ninguna ruta pública muestra quién reportó, quién marcó ni
// dónde está quien consulta. Si una ruta pública nueva los expone, esta prueba debe ampliarse.
describe('privacidad de las respuestas públicas (EC-08, #36)', () => {
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
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, reliability.bursts, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz privado',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: presentationId, quantity: 500, unit: 'g', packCount: 1, barcode: '7702511000014' },
      ],
    });
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

  it('ninguna respuesta pública trae el correo, el id de la cuenta, la clave seudónima ni la ubicación consultada', async () => {
    const reporter = await signIn(
      server,
      db,
      'reportante-privado@correo.com',
      'reportante',
      'Reportante Secretísima',
    );
    const flagger = await signIn(
      server,
      db,
      'marcadora-privada@correo.com',
      'reportante',
      'Marcadora Secretísima',
    );
    // PATCH /v1/me/profile: el nombre cambiado también es privado, igual que el original.
    await request(server)
      .patch('/v1/me/profile')
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .send({ displayName: 'Reportante Renombrada' })
      .expect(200);
    // #133: la moderación tampoco ve el nombre de quien reportó o marcó.
    const moderator = await signIn(server, db, 'moderadora-privada@correo.com', 'moderador');
    const report = await request(server)
      .post('/v1/reports')
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        presentationId,
        establishmentId: storeId,
        priceCop: 2500,
        observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      })
      .expect(201);
    const relay = app.get(OutboxRelay);
    await relay.runOnce();
    await relay.runOnce();
    await request(server)
      .post(`/v1/reports/${(report.body as { id: string }).id}/flag`)
      .set('Cookie', flagger.cookie)
      .set('X-CSRF-Token', flagger.csrfToken)
      .send({ reason: 'otro', comment: 'Prueba de privacidad' })
      .expect(202);
    const identity = app.get(ReporterIdentity);
    const secrets = [
      'reportante-privado@correo.com',
      'marcadora-privada@correo.com',
      reporter.accountId,
      flagger.accountId,
      (await identity.of(reporter.accountId)).reporterKey,
      (await identity.of(flagger.accountId)).reporterKey,
      userLocation.lat,
      userLocation.lng,
      // #133: el nombre visible solo sale en la propia sesión.
      'Reportante Secretísima',
      'Marcadora Secretísima',
      'Reportante Renombrada',
    ];

    const publicRoutes = [
      request(server).get('/v1/health'),
      request(server).get('/v1/products').query({ q: 'arroz' }),
      request(server).get('/v1/products').query({ barcode: '7702511000014' }),
      request(server).get(`/v1/products/${productId}`),
      request(server).get(`/v1/products/${productId}/comparison`).query(userLocation),
      request(server).get('/v1/establishments/nearby').query(userLocation),
      request(server).get(`/v1/establishments/${storeId}/prices`),
      request(server).get(`/v1/products/${productId}/history`),
      request(server).get('/v1/featured-products').query({ municipality: 'armenia' }),
      request(server).get('/v1/moderation/queue').set('Cookie', moderator.cookie),
      request(server).get('/v1/me/reports').set('Cookie', reporter.cookie),
    ];
    const responses = await Promise.all(publicRoutes);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ]);
    const everything = JSON.stringify(
      responses.map((response): unknown[] => [response.headers, response.body]),
    );
    expect(secrets.filter((secret) => everything.includes(secret))).toEqual([]);
    // La comparación sí muestra el precio reportado: la prueba revisa datos reales, no vacíos.
    expect(everything).toContain('2500');
  });
});
