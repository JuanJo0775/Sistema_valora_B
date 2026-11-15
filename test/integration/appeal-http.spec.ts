import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ReporterIdentity } from '../../src/modules/identity';
import type { Observation } from '../../src/modules/reliability/application/stores';
import { DrizzleObservationStore } from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Reporte de prueba: solo existe dentro de esta prueba.
const reportId = 'e5555555-5555-4555-8555-111111111111';
const otherReportId = 'e5555555-5555-4555-8555-222222222222';
const note = 'El precio sí era ese, está en la etiqueta';

describe('apelación por HTTP (RF-013 RN4, #71)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let author: SignedIn;
  let stranger: SignedIn;
  let moderatorA: SignedIn;
  let moderatorB: SignedIn;
  let authorKey: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    // Pocas cuentas para todo el archivo: los límites de inicio de sesión cuentan por IP.
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    author = await signIn(server, db, 'autora@correo.com');
    stranger = await signIn(server, db, 'otra@correo.com');
    moderatorA = await signIn(server, db, 'moderadora-a@correo.com', 'moderador');
    moderatorB = await signIn(server, db, 'moderadora-b@correo.com', 'moderador');
    authorKey = (await app.get(ReporterIdentity).of(author.accountId)).reporterKey;
  });

  afterAll(async () => {
    await app.close();
  });

  const suspicious = (id: string): Observation => ({
    reportId: id,
    presentationId: 'e6666666-6666-4666-8666-666666666666',
    establishmentId: 'e7777777-7777-4777-8777-777777777777',
    reporterKey: authorKey,
    reporterSince: new Date('2026-01-01T00:00:00Z'),
    priceCop: 2000,
    priceType: 'normal',
    observedAt: new Date(),
    receivedAt: new Date(),
    verdict: { status: 'sospechoso', reason: 'rango', median: 4000, deviation: 0.5, references: 3 },
  });

  const decide = (as: SignedIn, id: string, decision: string) =>
    request(server)
      .post(`/v1/moderation/${id}/decision`)
      .set('Cookie', as.cookie)
      .set('X-CSRF-Token', as.csrfToken)
      .send({ decision, note: 'Decisión de la prueba de apelación' });

  const appeal = (as: SignedIn | null, id = reportId, body: object = { note }) => {
    const call = request(server).post(`/v1/reports/${id}/appeal`).send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };

  beforeEach(async () => {
    await db.execute(
      sql`truncate reliability.observations, reliability.flags, reliability.moderation_log, reliability.appeals, reliability.reputations, shared.outbox, shared.processed_events`,
    );
    const store = new DrizzleObservationStore(db);
    await store.save(suspicious(reportId));
    await store.save(suspicious(otherReportId));
    await decide(moderatorA, reportId, 'descartar').expect(204);
  });

  describe('POST /v1/reports/{reportId}/appeal', () => {
    it('la autora apela su reporte descartado: 202 y entra a la cola como apelación', async () => {
      await appeal(author).expect(202);

      const queue = await request(server)
        .get('/v1/moderation/queue')
        .query({ reason: 'apelacion' })
        .set('Cookie', moderatorB.cookie)
        .expect(200);
      expect(queue.body).toMatchObject({
        items: [{ id: reportId, reason: 'apelacion', appealNote: note }],
      });
    });

    it('409 ALREADY_APPEALED la segunda vez; 422 NOT_APPEALABLE si no está descartado', async () => {
      await appeal(author).expect(202);

      const again = await appeal(author).expect(409);
      const notDiscarded = await appeal(author, otherReportId).expect(422);

      expect(again.body).toMatchObject({ code: 'ALREADY_APPEALED' });
      expect(notDiscarded.body).toMatchObject({ code: 'NOT_APPEALABLE' });
    });

    it('404 para otra cuenta y para un reporte que no existe; 400 con un motivo corto', async () => {
      const responses = await Promise.all([
        appeal(stranger),
        appeal(author, 'e5555555-5555-4555-8555-999999999999'),
        appeal(author, reportId, { note: 'corto' }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404, 400]);
    });

    it('sin sesión 401; un moderador o sin CSRF 403', async () => {
      const withoutCsrf = request(server)
        .post(`/v1/reports/${reportId}/appeal`)
        .set('Cookie', author.cookie)
        .send({ note });

      const responses = await Promise.all([appeal(null), appeal(moderatorB), withoutCsrf]);

      expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
    });
  });

  describe('GET /v1/me/reports/{reportId}/status', () => {
    const status = (as: SignedIn | null, id = reportId) => {
      const call = request(server).get(`/v1/me/reports/${id}/status`);
      return as ? call.set('Cookie', as.cookie) : call;
    };

    it('la autora ve que su reporte fue descartado y hasta cuándo puede apelar, sin caché', async () => {
      const response = await status(author).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        reportId,
        status: 'descartado',
        appealableUntil: expect.any(String) as unknown,
      });
      expect(JSON.stringify(response.body)).not.toContain('moderadora');
    });

    it('después de apelar ve la apelación pendiente', async () => {
      await appeal(author).expect(202);

      const response = await status(author).expect(200);

      expect(response.body).toEqual({ reportId, status: 'apelacion_pendiente' });
    });

    it('otra cuenta 404; un moderador 403; sin sesión 401', async () => {
      const responses = await Promise.all([status(stranger), status(moderatorB), status(null)]);

      expect(responses.map((response) => response.status)).toEqual([404, 403, 401]);
    });
  });
});
