import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { VAPID_PUBLIC_KEY } from '../../src/modules/notifications';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

const publicKey = 'B' + 'A'.repeat(86);
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
  let merchant: SignedIn;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VAPID_PUBLIC_KEY)
      .useValue(publicKey)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    moderator = await signIn(server, db, 'avisos-moderadora@correo.com', 'moderador');
    merchant = await signIn(server, db, 'avisos-comercio@correo.com', 'comercio');
    reporter = await signIn(server, db, 'avisos-reportante@correo.com');
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

  // Pruebas de resguardo: ya pasan con la ruta hecha; fijan el contrato.
  it('un comercio también puede activar los avisos', async () => {
    await subscribe(merchant).expect(204);

    const rows = await db.execute(sql`select account_id from notifications.push_subscriptions`);
    expect(rows.rows).toEqual([{ account_id: merchant.accountId }]);
  });

  it('un reportante no recibe avisos: 403; sin sesión, 401', async () => {
    await subscribe(reporter).expect(403);
    await subscribe(null).expect(401);

    const rows = await db.execute(sql`select 1 from notifications.push_subscriptions`);
    expect(rows.rows).toHaveLength(0);
  });

  it('activar dos veces el mismo dispositivo no lo duplica', async () => {
    await subscribe(moderator).expect(204);
    await subscribe(moderator).expect(204);

    const rows = await db.execute(sql`select 1 from notifications.push_subscriptions`);
    expect(rows.rows).toHaveLength(1);
  });

  // EC-08: el aviso de una cuenta no puede llegar al navegador de otra persona.
  it('si otra cuenta activa los avisos desde el mismo navegador, la dirección pasa a ella', async () => {
    await subscribe(moderator).expect(204);
    await subscribe(merchant).expect(204);

    const rows = await db.execute(sql`select account_id from notifications.push_subscriptions`);
    expect(rows.rows).toEqual([{ account_id: merchant.accountId }]);
  });

  it.each([
    ['una dirección que no es https', { ...subscription, endpoint: 'http://push.example.net/x' }],
    ['sin las claves', { endpoint: subscription.endpoint }],
    [
      'una clave con caracteres no válidos',
      { ...subscription, keys: { p256dh: '¡no!', auth: 'a'.repeat(22) } },
    ],
    ['un campo que no existe', { ...subscription, userAgent: 'Mozilla/5.0' }],
  ])('rechaza %s: 400', async (_name, body) => {
    const response = await subscribe(moderator, body).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    const rows = await db.execute(sql`select 1 from notifications.push_subscriptions`);
    expect(rows.rows).toHaveLength(0);
  });

  describe('DELETE /v1/notifications/subscriptions', () => {
    const unsubscribe = (
      as: SignedIn | null,
      body: object = { endpoint: subscription.endpoint },
    ) => {
      const call = request(server).delete('/v1/notifications/subscriptions').send(body);
      return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    };

    it('un moderador desactiva los avisos de su dispositivo: 204 y se borra', async () => {
      await subscribe(moderator).expect(204);

      await unsubscribe(moderator).expect(204);

      const rows = await db.execute(sql`select 1 from notifications.push_subscriptions`);
      expect(rows.rows).toHaveLength(0);
    });

    // Pruebas de resguardo: ya pasan con la ruta hecha; fijan el contrato.
    it('desactivar un dispositivo que no existe responde 204 igual', async () => {
      await unsubscribe(moderator).expect(204);
    });

    // No revela qué direcciones existen y nadie borra los avisos de otra cuenta.
    it('no borra la suscripción de otra cuenta y responde 204 igual', async () => {
      await subscribe(merchant).expect(204);

      await unsubscribe(moderator).expect(204);

      const rows = await db.execute(sql`select account_id from notifications.push_subscriptions`);
      expect(rows.rows).toEqual([{ account_id: merchant.accountId }]);
    });

    it('un reportante no puede: 403; sin sesión, 401', async () => {
      await unsubscribe(reporter).expect(403);
      await unsubscribe(null).expect(401);
    });

    it.each([
      ['una dirección que no es https', { endpoint: 'http://push.example.net/x' }],
      ['sin la dirección', {}],
      ['un campo que no existe', { endpoint: subscription.endpoint, todo: true }],
    ])('rechaza %s: 400', async (_name, body) => {
      const response = await unsubscribe(moderator, body).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('GET /v1/notifications/vapid-public-key', () => {
    it('es pública y entrega la clave pública, con caché', async () => {
      const response = await request(server).get('/v1/notifications/vapid-public-key').expect(200);

      expect(response.body).toEqual({ publicKey });
      expect(response.headers['cache-control']).toContain('public');
    });
  });
});

// Sin clave pública configurada los avisos no existen: la PWA no muestra «Activar avisos».
describe('GET /v1/notifications/vapid-public-key sin clave configurada (#259)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VAPID_PUBLIC_KEY)
      .useValue(undefined)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 404', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server).get('/v1/notifications/vapid-public-key').expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });
});
