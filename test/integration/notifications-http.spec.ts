import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const subscription = {
  endpoint: 'https://push.example.net/dispositivo-http-1',
  keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
};

// Avisos push (#259, ADR-044 y ADR-045): suscribir un dispositivo por HTTP.
describe('suscripciones a los avisos por HTTP (#259)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
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
    moderator = await signIn(server, db, 'avisos-moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate notifications.push_subscriptions`);
  });

  const subscribe = (as: SignedIn | null, body: object = subscription) => {
    const call = request(server).post('/v1/notifications/subscriptions').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };

  it('un moderador activa los avisos: 204 y la suscripción queda a nombre de su cuenta', async () => {
    const response = await subscribe(moderator).expect(204);

    expect(response.text).toBe('');
    const rows = await db.execute(
      sql`select account_id, endpoint from notifications.push_subscriptions`,
    );
    expect(rows.rows).toEqual([
      { account_id: moderator.accountId, endpoint: subscription.endpoint },
    ]);
  });
});
