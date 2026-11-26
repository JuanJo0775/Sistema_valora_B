import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AccountsByRole } from '../../src/modules/identity';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// #260: notifications pregunta a identity quiénes son los moderadores, sin ver su correo (EC-08).
describe('cuentas por rol (#260)', () => {
  let app: INestApplication;
  let db: Database;
  let moderator: SignedIn;
  let secondModerator: SignedIn;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    const server = app.getHttpServer() as Parameters<typeof signIn>[0];
    moderator = await signIn(server, db, 'rol-moderadora@correo.com', 'moderador');
    secondModerator = await signIn(server, db, 'rol-moderador2@correo.com', 'moderador');
    reporter = await signIn(server, db, 'rol-reportante@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista los ids de las cuentas con el rol pedido', async () => {
    const ids = await app.get(AccountsByRole).ids('moderador');

    expect([...ids].sort()).toEqual([moderator.accountId, secondModerator.accountId].sort());
    expect(ids).not.toContain(reporter.accountId);
  });

  // Una cuenta que se va a borrar, o que está suspendida, no recibe avisos.
  it('no incluye las cuentas pendientes de eliminación ni las suspendidas', async () => {
    const leaving = await signIn(
      app.getHttpServer() as Parameters<typeof signIn>[0],
      db,
      'rol-se-va@correo.com',
      'moderador',
    );
    const suspended = await signIn(
      app.getHttpServer() as Parameters<typeof signIn>[0],
      db,
      'rol-suspendida@correo.com',
      'moderador',
    );
    await db.execute(
      sql`update identity.accounts set deletion_scheduled_for = now() + interval '5 days' where id = ${leaving.accountId}`,
    );
    await db.execute(
      sql`update identity.accounts set suspended_until = now() + interval '2 days' where id = ${suspended.accountId}`,
    );

    const ids = await app.get(AccountsByRole).ids('moderador');

    expect([...ids].sort()).toEqual([moderator.accountId, secondModerator.accountId].sort());
  });
});
