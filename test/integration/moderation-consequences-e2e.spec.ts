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
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Producto, presentación y tiendas de prueba: solo existen dentro de esta prueba.
const productId = 'a9111111-1111-4111-8111-222222222222';
const presentationId = 'a9111111-1111-4111-8111-bbbbbbbbbbbb';
const stores = {
  aprobar: 'a9222222-2222-4222-8222-111111111111',
  descartar: 'a9222222-2222-4222-8222-222222222222',
  observar: 'a9222222-2222-4222-8222-333333333333',
} as const;

type Decision = keyof typeof stores;
// Lo que se lee después de decidir: «Mis aportes», la tienda, el historial, la cola y la sesión del autor.
const EXPECTED = {
  aprobar: {
    inQueue: false,
    myStatus: 'normal',
    storeShows: [[true, false]],
    history: ['cuenta'],
    suspension: false,
  },
  descartar: {
    inQueue: false,
    myStatus: 'descartado',
    storeShows: [],
    history: ['retirado'],
    suspension: false,
  },
  observar: {
    inQueue: false,
    myStatus: 'descartado',
    storeShows: [],
    history: ['retirado'],
    suspension: true,
  },
} as const;
const DECISION_OF = {
  aprobar: 'aprobar',
  descartar: 'descartar',
  observar: 'observar_cuentas',
} as const;

// H34: moderación decide y el aporte queda en un estado final coherente en todos los lugares donde se
// lee. Archivo propio: los límites de registro e inicio de sesión cuentan por IP y viven en memoria.
describe('consecuencias de una decisión de moderación de punta a punta (H34 y H33)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let relay: OutboxRelay;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    relay = app.get(OutboxRelay);
    await db.execute(
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, catalog.presentations, catalog.products, establishments.establishments, identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 1000, unit: 'g', packCount: 1 }],
    });
    for (const [index, id] of Object.values(stores).entries()) {
      await app.get(ImportEstablishments).save({
        id,
        name: `Tienda ${String(index)}`,
        type: 'barrio',
        lat: 4.535 + index * 0.0005,
        lng: -75.6811,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['aprobar', 'descartar', 'observar'] as const)(
    'tras «%s» el aporte no queda «en revisión» ni en «Mis aportes», ni en la tienda, ni en la cola',
    async (choice: Decision) => {
      const storeId = stores[choice];
      const ana = await signIn(server, db, `ana-${choice}@correo.com`);
      const beto = await signIn(server, db, `beto-${choice}@correo.com`);
      const moderator = await signIn(server, db, `moderadora-${choice}@correo.com`, 'moderador');
      const post = (as: SignedIn, path: string, body: object, headers = {}) =>
        request(server)
          .post(path)
          .set('Cookie', as.cookie)
          .set('X-CSRF-Token', as.csrfToken)
          .set(headers)
          .send(body);
      const receipt = await post(
        ana,
        '/v1/reports',
        {
          presentationId,
          establishmentId: storeId,
          priceCop: 15000,
          observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        { 'Idempotency-Key': crypto.randomUUID() },
      ).expect(201);
      const reportId = (receipt.body as { id: string }).id;
      await relay.runOnce();
      await relay.runOnce();
      await post(beto, `/v1/reports/${reportId}/flag`, { reason: 'precio_falso' }).expect(202);
      await relay.runOnce();

      const queueNow = () =>
        request(server).get('/v1/moderation/queue').set('Cookie', moderator.cookie).expect(200);
      // Tras observar, la suspensión revoca la sesión de ana: se lee con la sesión limitada de un nuevo inicio.
      const myReports = (cookie = ana.cookie) =>
        request(server)
          .get('/v1/me/reports')
          .set('Cookie', cookie)
          .then((response) => {
            const items = (response.body as { items: { reportId: string; status: string }[] })
              .items;
            return items.find((item) => item.reportId === reportId)?.status;
          });
      const storePrices = async () =>
        (
          (await request(server).get(`/v1/establishments/${storeId}/prices`).expect(200)).body as {
            prices: { reportId: string; reliability: string }[];
          }
        ).prices;
      expect(await myReports()).toBe('en_revision');
      expect((await storePrices()).map((price) => price.reliability)).toEqual(['en_revision']);

      await post(moderator, `/v1/moderation/${reportId}/decision`, {
        decision: DECISION_OF[choice],
        note: 'Decisión de la prueba de consecuencias',
      }).expect(204);
      await relay.runOnce();
      await relay.runOnce();

      const queue = await queueNow();
      const history = await db.execute<{ status: string }>(
        sql`select status from comparison.price_history where report_id = ${reportId}`,
      );
      const login = await request(server)
        .post('/v1/auth/login')
        .send({ email: `ana-${choice}@correo.com`, password: 'una-clave-larga' })
        .expect(204);
      const [setCookie] = login.headers['set-cookie'] as unknown as string[];
      const limitedCookie = (setCookie ?? '').split(';')[0] ?? '';
      const session = await request(server)
        .get('/v1/auth/session')
        .set('Cookie', limitedCookie)
        .expect(200);
      const sessionBody = session.body as { suspendedUntil?: string; suspension?: unknown };
      const prices = await storePrices();

      expect({
        inQueue: (queue.body as { items: { id: string }[] }).items.some(
          (item) => item.id === reportId,
        ),
        myStatus: await myReports(limitedCookie),
        storeShows: prices.map((price) => [
          price.reportId === reportId,
          price.reliability === 'en_revision',
        ]),
        history: history.rows.map((row) => row.status),
        // H33: la sanción es visible y explicada, sin notas del moderador ni de quién denunció.
        suspension: sessionBody.suspension,
        suspendedUntil: sessionBody.suspendedUntil,
      }).toEqual({
        ...EXPECTED[choice],
        suspendedUntil: EXPECTED[choice].suspension ? sessionBody.suspendedUntil : undefined,
        suspension: EXPECTED[choice].suspension
          ? { until: sessionBody.suspendedUntil, reason: 'observada_por_moderacion' }
          : undefined,
      });
      expect(JSON.stringify(session.body)).not.toContain('Decisión de la prueba');
      expect(contractErrors('GET /auth/session', 200, session.body as unknown)).toEqual([]);
    },
  );
});
