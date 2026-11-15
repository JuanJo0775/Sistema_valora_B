import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const note = 'Se une al equipo de moderación';

describe('POST /v1/moderation/roles (RF-002 RN1 y RN4)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let moderator: SignedIn;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    // Pocas cuentas para todo el archivo: los límites de inicio de sesión cuentan por IP.
    await db.execute(sql`truncate identity.sessions, identity.accounts, identity.role_changes`);
    moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
    reporter = await signIn(server, db, 'ana@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate identity.role_changes`);
    await db.execute(
      sql`update identity.accounts set role = 'reportante' where email = 'ana@correo.com'`,
    );
  });

  const changeRole = (as: SignedIn | null, body: object) => {
    const call = request(server).post('/v1/moderation/roles').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };

  it('204: la cuenta es moderadora desde su siguiente petición y el cambio queda anotado', async () => {
    await request(server).get('/v1/moderation/queue').set('Cookie', reporter.cookie).expect(403);

    await changeRole(moderator, { email: 'ana@correo.com', role: 'moderador', note }).expect(204);

    await request(server).get('/v1/moderation/queue').set('Cookie', reporter.cookie).expect(200);
    const log = await db.execute(
      sql`select account_id, from_role, to_role, changed_by, note from identity.role_changes`,
    );
    expect(log.rows).toEqual([
      {
        account_id: reporter.accountId,
        from_role: 'reportante',
        to_role: 'moderador',
        changed_by: moderator.accountId,
        note,
      },
    ]);
  });

  it('400 con un rol que no se asigna, un motivo corto o un correo inválido', async () => {
    const responses = await Promise.all([
      changeRole(moderator, { email: 'ana@correo.com', role: 'comercio', note }),
      changeRole(moderator, { email: 'ana@correo.com', role: 'moderador', note: 'corto' }),
      changeRole(moderator, { email: 'ana@correo.com', role: 'moderador', note: ' '.repeat(12) }),
      changeRole(moderator, { email: 'no-es-correo', role: 'moderador', note }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
  });

  it('404 si ninguna cuenta tiene el correo', async () => {
    const response = await changeRole(moderator, {
      email: 'nadie@correo.com',
      role: 'moderador',
      note,
    }).expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('409 OWN_ROLE con su propio rol y ROLE_UNCHANGED con el rol que ya tiene', async () => {
    const own = await changeRole(moderator, {
      email: 'moderadora@correo.com',
      role: 'reportante',
      note,
    }).expect(409);
    const unchanged = await changeRole(moderator, {
      email: 'ana@correo.com',
      role: 'reportante',
      note,
    }).expect(409);

    expect(own.body).toMatchObject({ code: 'OWN_ROLE' });
    expect(unchanged.body).toMatchObject({ code: 'ROLE_UNCHANGED' });
  });

  it('sin sesión 401; un reportante o sin CSRF 403', async () => {
    const body = { email: 'ana@correo.com', role: 'moderador', note };
    const withoutCsrf = request(server)
      .post('/v1/moderation/roles')
      .set('Cookie', moderator.cookie)
      .send(body);

    const responses = await Promise.all([
      changeRole(null, body),
      changeRole(reporter, body),
      withoutCsrf,
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
  });
});
