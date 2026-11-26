import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { Observation } from '../../src/modules/reliability/application/stores';
import { DrizzleObservationStore } from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const reportId = 'e5111111-1111-4111-8111-111111111111';
const observation: Observation = {
  reportId,
  presentationId: 'e5222222-2222-4222-8222-222222222222',
  establishmentId: 'e5333333-3333-4333-8333-333333333333',
  reporterKey: 'a'.repeat(64),
  reporterSince: new Date('2026-01-01T00:00:00Z'),
  priceCop: 2000,
  priceType: 'normal',
  observedAt: new Date('2026-11-14T12:00:00Z'),
  receivedAt: new Date('2026-11-14T12:00:01Z'),
  verdict: { status: 'normal', median: 2000, deviation: 0, references: 3 },
};

// #257: el contador de la campana y de las pestañas, con la base real.
describe('GET /v1/moderation/summary (#257)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let reporter: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    reporter = await signIn(server, db, 'resumen-reportante@correo.com');
    moderator = await signIn(server, db, 'resumen-moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate reliability.observations, reliability.flags, reliability.moderation_log, reliability.reputations, reliability.official_reviews, catalog.product_requests, establishments.store_proposals, establishments.store_corrections, commerce.merchant_cases, commerce.dispute_challengers, shared.outbox, shared.processed_events`,
    );
  });

  const summary = () =>
    request(server).get('/v1/moderation/summary').set('Cookie', moderator.cookie);
  const asReporter = (call: request.Test) =>
    call.set('Cookie', reporter.cookie).set('X-CSRF-Token', reporter.csrfToken);

  it('con las colas vacías responde ceros y no se guarda en ninguna caché', async () => {
    const response = await summary().expect(200);

    expect(response.body).toEqual({ precios: 0, tiendas: 0, productos: 0, comercios: 0 });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('cuenta lo que hay en cada cola y coincide con lo que muestran las listas', async () => {
    await new DrizzleObservationStore(db).save(observation);
    await asReporter(request(server).post(`/v1/reports/${reportId}/flag`))
      .send({ reason: 'precio_falso' })
      .expect(202);
    await asReporter(request(server).post('/v1/establishment-proposals'))
      .send({
        name: 'Tienda del resumen',
        type: 'barrio',
        municipality: 'armenia',
        lat: 4.5339,
        lng: -75.6811,
      })
      .expect(202);
    await asReporter(request(server).post('/v1/product-requests'))
      .send({
        name: 'Panela del resumen',
        categoryCode: 'grains-groceries',
        quantity: 500,
        unit: 'g',
      })
      .expect(202);

    const counts = (await summary().expect(200)).body as Record<string, number>;
    const length = async (path: string) =>
      (
        (await request(server).get(path).set('Cookie', moderator.cookie).expect(200)).body as {
          items: unknown[];
        }
      ).items.length;

    expect(counts).toEqual({ precios: 1, tiendas: 1, productos: 1, comercios: 0 });
    expect(counts['precios']).toBe(await length('/v1/moderation/queue'));
    expect(counts['tiendas']).toBe(await length('/v1/moderation/store-proposals'));
    expect(counts['productos']).toBe(await length('/v1/moderation/product-requests'));
    expect(counts['comercios']).toBe(await length('/v1/moderation/merchant-cases'));
  });

  // EC-08: solo números, nunca ids ni claves de quien reportó o pidió.
  it('no trae nada más que los cuatro números', async () => {
    await new DrizzleObservationStore(db).save(observation);
    await asReporter(request(server).post(`/v1/reports/${reportId}/flag`))
      .send({ reason: 'precio_falso' })
      .expect(202);

    const response = await summary().expect(200);

    expect(Object.keys(response.body as object).sort()).toEqual([
      'comercios',
      'precios',
      'productos',
      'tiendas',
    ]);
    expect(JSON.stringify(response.body)).not.toContain('a'.repeat(64));
  });
});
