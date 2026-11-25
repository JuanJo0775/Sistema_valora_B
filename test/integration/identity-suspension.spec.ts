import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Database } from '../../src/shared/database/database.module';
import type * as Events from '../../src/shared/events';
import { signIn } from '../support/sign-in';

describe('suspensión pedida por reliability (grill de la #33, pregunta 6)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let events: typeof Events;
  let identity: typeof import('../../src/modules/identity');

  beforeAll(async () => {
    // Intervalo muy largo: el repartidor se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const { AppModule } = await import('../../src/app.module');
    const { configureApp } = await import('../../src/app.setup');
    const { DATABASE } = await import('../../src/shared/database/database.module');
    events = await import('../../src/shared/events');
    identity = await import('../../src/modules/identity');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts, shared.outbox, shared.processed_events`,
    );
  });

  const requestSuspension = async (
    reporterKey: string,
    suspendedUntil: Date,
    reason: 'observar_cuentas' | 'rechazos_seguidos' = 'observar_cuentas',
  ) => {
    const event = events.createEvent('ReporterSuspensionRequested', 1, {
      reporterKey,
      reason,
      suspendedUntil: suspendedUntil.toISOString(),
    });
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();
  };

  it('la cuenta con esa clave queda suspendida y su sesión deja de servir', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    const { reporterKey } = await app.get(identity.ReporterIdentity).of(ana.accountId);
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await requestSuspension(reporterKey, until);

    await request(server).get('/v1/auth/session').set('Cookie', ana.cookie).expect(401);
    const stored = await db.execute<{ suspended_until: string }>(
      sql`select suspended_until from identity.accounts`,
    );
    expect(stored.rows.map((row) => new Date(row.suspended_until))).toEqual([until]);
  });

  // H33: la sesión limitada dice hasta cuándo y por qué, con una causa estable y sin datos internos.
  it.each([
    ['observar_cuentas', 'observada_por_moderacion'],
    ['rechazos_seguidos', 'descartes_seguidos'],
  ] as const)(
    'la sesión de la cuenta suspendida por %s trae suspension { until, reason: %s }',
    async (cause, expected) => {
      const ana = await signIn(server, db, 'ana@correo.com');
      const { reporterKey } = await app.get(identity.ReporterIdentity).of(ana.accountId);
      const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await requestSuspension(reporterKey, until, cause);

      const login = await request(server)
        .post('/v1/auth/login')
        .send({ email: 'ana@correo.com', password: 'una-clave-larga' });
      const cookie = (login.headers['set-cookie'] as unknown as string[]).map(
        (line) => line.split(';')[0] ?? '',
      );
      const session = await request(server).get('/v1/auth/session').set('Cookie', cookie);

      expect(session.status).toBe(200);
      expect(session.body).toMatchObject({
        suspendedUntil: until.toISOString(),
        suspension: { until: until.toISOString(), reason: expected },
      });
      expect(Object.keys((session.body as { suspension: object }).suspension).sort()).toEqual([
        'reason',
        'until',
      ]);
    },
  );

  it('una clave que ninguna cuenta tiene no cambia nada', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');

    await requestSuspension('e'.repeat(64), new Date(Date.now() + 60_000));

    const session = await request(server).get('/v1/auth/session').set('Cookie', ana.cookie);

    expect(session.status).toBe(200);
  });

  // Grill de la #71, pregunta 4.
  it('ReporterSuspensionLifted con la misma fecha devuelve el acceso a la cuenta', async () => {
    const ana = await signIn(server, db, 'ana@correo.com');
    const { reporterKey } = await app.get(identity.ReporterIdentity).of(ana.accountId);
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await requestSuspension(reporterKey, until);

    const event = events.createEvent('ReporterSuspensionLifted', 1, {
      reporterKey,
      suspendedUntil: until.toISOString(),
    });
    await db.transaction((tx) => app.get(events.OutboxPublisher).publish(tx, event));
    await app.get(events.OutboxRelay).runOnce();

    const login = await request(server)
      .post('/v1/auth/login')
      .send({ email: 'ana@correo.com', password: 'una-clave-larga' });
    expect(login.status).toBe(204);
  });
});
