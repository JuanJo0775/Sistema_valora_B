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

// Reporte de prueba ya evaluado por reliability: solo existe dentro de esta prueba.
const reportId = 'e1111111-1111-4111-8111-111111111111';
const unknownReportId = 'e1111111-1111-4111-8111-999999999999';
const observation: Observation = {
  reportId,
  presentationId: 'e2222222-2222-4222-8222-222222222222',
  establishmentId: 'e3333333-3333-4333-8333-333333333333',
  reporterKey: 'f'.repeat(64),
  reporterSince: new Date('2026-01-01T00:00:00Z'),
  priceCop: 2000,
  priceType: 'normal',
  observedAt: new Date('2026-11-14T12:00:00Z'),
  receivedAt: new Date('2026-11-14T12:00:01Z'),
  verdict: { status: 'normal', median: 2000, deviation: 0, references: 3 },
};

describe('moderación por HTTP (RF-013)', () => {
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
    // Pocas cuentas para todo el archivo: los límites de inicio de sesión cuentan por IP.
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    reporter = await signIn(server, db, 'reportante@correo.com');
    moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate reliability.observations, reliability.flags, reliability.moderation_log, reliability.reputations, shared.outbox, shared.processed_events`,
    );
    await new DrizzleObservationStore(db).save(observation);
  });

  describe('POST /v1/reports/{reportId}/flag', () => {
    const flag = (
      as: SignedIn | null,
      id = reportId,
      body: object = { reason: 'precio_falso' },
    ) => {
      const call = request(server).post(`/v1/reports/${id}/flag`).send(body);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };

    it('un reportante marca un reporte: 202 y el reporte entra a la cola', async () => {
      await flag(reporter).expect(202);

      const flags = await db.execute(sql`select reason from reliability.flags`);
      expect(flags.rows).toEqual([{ reason: 'precio_falso' }]);
    });

    it('la misma cuenta no lo marca dos veces: 409 ALREADY_FLAGGED', async () => {
      await flag(reporter).expect(202);

      const response = await flag(reporter).expect(409);

      expect(response.body).toMatchObject({ code: 'ALREADY_FLAGGED' });
    });

    it('un reporte que no existe responde 404', async () => {
      const response = await flag(reporter, unknownReportId).expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('un motivo fuera de la lista, un comentario largo o un id inválido responden 400', async () => {
      const responses = await Promise.all([
        flag(reporter, reportId, { reason: 'no_me_gusta' }),
        flag(reporter, reportId, { reason: 'otro', comment: 'x'.repeat(281) }),
        flag(reporter, 'no-es-uuid'),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    });

    it('sin sesión 401; con otro rol o sin CSRF 403', async () => {
      const withoutCsrf = request(server)
        .post(`/v1/reports/${reportId}/flag`)
        .set('Cookie', reporter.cookie)
        .send({ reason: 'otro' });

      const responses = await Promise.all([flag(null), flag(moderator), withoutCsrf]);

      expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
    });
  });

  describe('GET /v1/moderation/queue', () => {
    const queue = (as: SignedIn | null, query: Record<string, string> = {}) => {
      const call = request(server).get('/v1/moderation/queue').query(query);
      return as ? call.set('Cookie', as.cookie) : call;
    };

    it('un moderador ve el reporte marcado, sin datos de las cuentas', async () => {
      await request(server)
        .post(`/v1/reports/${reportId}/flag`)
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .send({ reason: 'precio_falso' })
        .expect(202);

      const response = await queue(moderator).expect(200);

      expect(response.body).toEqual({
        items: [
          {
            id: reportId,
            reason: 'marcado',
            productName: 'Sin nombre',
            establishmentName: 'Sin nombre',
            reportedPriceCop: 2000,
            medianPriceCop: 2000,
            deviationPercent: 0,
            reportersCount: 1,
            createdAt: observation.receivedAt.toISOString(),
          },
        ],
      });
      expect(JSON.stringify(response.body)).not.toContain(observation.reporterKey);
    });

    it('un motivo desconocido o un límite fuera de rango responden 400', async () => {
      const responses = await Promise.all([
        queue(moderator, { reason: 'otro' }),
        queue(moderator, { limit: '51' }),
        queue(moderator, { limit: '0' }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    });

    it('sin sesión 401; un reportante 403', async () => {
      const responses = await Promise.all([queue(null), queue(reporter)]);

      expect(responses.map((response) => response.status)).toEqual([401, 403]);
    });
  });

  describe('POST /v1/moderation/{itemId}/decision', () => {
    const note = 'El precio no coincide con la foto de la góndola';
    const decide = (
      as: SignedIn | null,
      id = reportId,
      body: object = { decision: 'aprobar', note },
    ) => {
      const call = request(server).post(`/v1/moderation/${id}/decision`).send(body);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };
    const flagged = () =>
      request(server)
        .post(`/v1/reports/${reportId}/flag`)
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .send({ reason: 'precio_falso' })
        .expect(202);

    it('un moderador descarta un reporte de la cola: 204, queda en la bitácora y sale de la cola', async () => {
      await flagged();

      await decide(moderator, reportId, { decision: 'descartar', note }).expect(204);

      const log = await db.execute(
        sql`select decision, note, moderator_key from reliability.moderation_log`,
      );
      expect(log.rows).toEqual([
        {
          decision: 'descartar',
          note,
          moderator_key: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
        },
      ]);
      const queue = await request(server)
        .get('/v1/moderation/queue')
        .set('Cookie', moderator.cookie)
        .expect(200);
      expect(queue.body).toEqual({ items: [] });
    });

    it('sin motivo, con uno corto o solo con espacios responde 400 y no se registra', async () => {
      await flagged();

      const responses = await Promise.all([
        decide(moderator, reportId, { decision: 'aprobar' }),
        decide(moderator, reportId, { decision: 'aprobar', note: 'corto' }),
        decide(moderator, reportId, { decision: 'borrar', note }),
        decide(moderator, reportId, { decision: 'aprobar', note: ' '.repeat(12) }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
      const log = await db.execute(sql`select 1 from reliability.moderation_log`);
      expect(log.rows).toEqual([]);
    });

    it('un reporte que no está en la cola responde 404', async () => {
      const response = await decide(moderator).expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('sin sesión 401; un reportante o sin CSRF 403', async () => {
      await flagged();
      const withoutCsrf = request(server)
        .post(`/v1/moderation/${reportId}/decision`)
        .set('Cookie', moderator.cookie)
        .send({ decision: 'aprobar', note });

      const responses = await Promise.all([decide(null), decide(reporter), withoutCsrf]);

      expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
    });
  });
});
