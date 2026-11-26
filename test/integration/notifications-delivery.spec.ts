import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ImportEstablishments } from '../../src/modules/establishments';
import { configureApp } from '../../src/app.setup';
import { PUSH_SENDER } from '../../src/modules/notifications';
import {
  type PushDevice,
  PushUnavailableError,
  type PushSender,
} from '../../src/modules/notifications/application/push-sender';
import type { Observation } from '../../src/modules/reliability/application/stores';
import { DrizzleObservationStore } from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { createEvent, OutboxPublisher, OutboxRelay } from '../../src/shared/events';
import { type SignedIn, signIn } from '../support/sign-in';

const storeId = 'e6444444-4444-4444-8444-444444444444';
const STORE = { lat: 4.5339, lng: -75.6811 };
const reportId = 'e6111111-1111-4111-8111-111111111111';
const secondReportId = 'e6111111-1111-4111-8111-222222222222';
const reporterKey = 'c'.repeat(64);
const observation = (id: string): Observation => ({
  reportId: id,
  presentationId: 'e6222222-2222-4222-8222-222222222222',
  establishmentId: 'e6333333-3333-4333-8333-333333333333',
  reporterKey,
  reporterSince: new Date('2026-01-01T00:00:00Z'),
  priceCop: 2000,
  priceType: 'normal',
  observedAt: new Date('2026-11-14T12:00:00Z'),
  receivedAt: new Date('2026-11-14T12:00:01Z'),
  verdict: { status: 'normal', median: 2000, deviation: 0, references: 3 },
});

class RecordingSender implements PushSender {
  sent: { endpoint: string; content: object }[] = [];
  down = false;

  send(device: PushDevice, content: object): Promise<'sent' | 'gone'> {
    if (this.down) return Promise.reject(new PushUnavailableError());
    this.sent.push({ endpoint: device.endpoint, content });
    return Promise.resolve('sent');
  }
}

// #260, ADR-044: un caso nuevo en la cola de precios avisa a los moderadores con la app cerrada.
describe('envío de avisos a moderación (#260)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let moderator: SignedIn;
  let reporter: SignedIn;
  let owner: SignedIn;
  let merchant: SignedIn;
  const sender = new RecordingSender();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUSH_SENDER)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    moderator = await signIn(server, db, 'envio-moderadora@correo.com', 'moderador');
    reporter = await signIn(server, db, 'envio-reportante@correo.com');
    owner = await signIn(server, db, 'envio-dueno@correo.com');
    merchant = await signIn(server, db, 'envio-comercio@correo.com', 'comercio');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    sender.sent = [];
    sender.down = false;
    await db.execute(
      sql`truncate notifications.push_subscriptions, notifications.sent_notices, reliability.observations, reliability.flags, reliability.moderation_log, reliability.reputations, establishments.establishments, establishments.store_proposals, establishments.store_corrections, catalog.product_requests, commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.dispute_challengers, shared.outbox, shared.processed_events`,
    );
    await request(server)
      .post('/v1/notifications/subscriptions')
      .set('Cookie', moderator.cookie)
      .set('X-CSRF-Token', moderator.csrfToken)
      .send({
        endpoint: 'https://push.example.net/moderadora-telefono',
        keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
      })
      .expect(204);
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await new DrizzleObservationStore(db).save(observation(reportId));
    await new DrizzleObservationStore(db).save(observation(secondReportId));
  });

  const flag = (id: string) =>
    request(server)
      .post(`/v1/reports/${id}/flag`)
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .send({ reason: 'precio_falso' });
  const relay = async () => {
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
  };

  it('un reporte marcado avisa al moderador con un texto genérico', async () => {
    await flag(reportId).expect(202);
    await relay();

    expect(sender.sent).toEqual([
      {
        endpoint: 'https://push.example.net/moderadora-telefono',
        content: {
          title: 'Valora',
          body: 'Hay casos nuevos para revisar en Precios',
          url: '/moderacion?vista=precios',
          tag: 'moderacion-precios',
        },
      },
    ]);
  });

  // Pruebas de resguardo: ya pasan con el envío hecho.
  it('un segundo caso a los pocos minutos no manda otro aviso a la misma cuenta', async () => {
    await flag(reportId).expect(202);
    await relay();
    await flag(secondReportId).expect(202);
    await relay();

    expect(sender.sent).toHaveLength(1);
  });

  // EC-04: el aviso corre después de confirmar el reporte; si falla, el reporte ya está guardado.
  it('si el servicio de push no responde, marcar el reporte sigue funcionando', async () => {
    sender.down = true;

    await flag(reportId).expect(202);
    await relay();

    expect(sender.sent).toHaveLength(0);
    const flags = await db.execute(sql`select 1 from reliability.flags`);
    expect(flags.rows).toHaveLength(1);
    const notices = await db.execute(sql`select 1 from notifications.sent_notices`);
    expect(notices.rows).toHaveLength(0);
  });

  it('cuando el servicio de push vuelve, el outbox reintenta y el aviso llega una sola vez', async () => {
    sender.down = true;
    await flag(reportId).expect(202);
    await relay();

    sender.down = false;
    await relay();
    await relay();

    expect(sender.sent).toHaveLength(1);
  });

  // EC-08: el aviso no lleva el id del reporte, ni la clave de quien lo hizo, ni la tienda.
  it('el contenido enviado no trae ningún dato del reporte ni de las personas', async () => {
    await flag(reportId).expect(202);
    await relay();

    const written = JSON.stringify(sender.sent);
    expect(written).not.toContain(reportId);
    expect(written).not.toContain(reporterKey);
    expect(written).not.toContain('e6333333');
    expect(written).not.toContain(moderator.accountId);
  });

  // Fase 2 de #260: las otras colas del panel avisan con los eventos de sus módulos.
  const post = (as: SignedIn, path: string, body: object) =>
    request(server)
      .post(`/v1${path}`)
      .set('Cookie', as.cookie)
      .set('X-CSRF-Token', as.csrfToken)
      .send(body);
  const bodies = () => sender.sent.map(({ content }) => (content as { body: string }).body);

  it('proponer una tienda avisa a la cola de tiendas', async () => {
    await post(reporter, '/establishment-proposals', {
      name: 'Granero La Vecina',
      type: 'barrio',
      municipality: 'armenia',
      ...STORE,
    }).expect(202);
    await relay();

    expect(bodies()).toEqual(['Hay casos nuevos para revisar en Tiendas']);
  });

  it('pedir un producto avisa a la cola de productos', async () => {
    await post(reporter, '/product-requests', {
      name: 'Panela del aviso',
      categoryCode: 'grains-groceries',
      quantity: 500,
      unit: 'g',
    }).expect(202);
    await relay();

    expect(bodies()).toEqual(['Hay casos nuevos para revisar en Productos']);
  });

  it('denunciar un comercio avisa a la cola de comercios', async () => {
    await post(owner, '/commerce/claims', {
      establishmentId: storeId,
      responsibleName: 'Rosa Gómez',
      phone: '3001234567',
      acceptedTermsVersion: '2026-11',
      location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
    }).expect(201);
    await relay();
    sender.sent = [];
    await db.execute(sql`truncate notifications.sent_notices`);

    await post(reporter, `/establishments/${storeId}/merchant-reports`, {
      reason: 'El dueño real de la tienda es don Luis, no esta persona.',
    }).expect(202);
    await relay();

    expect(bodies()).toEqual(['Hay casos nuevos para revisar en Comercios']);
  });

  // El límite de 5 minutos es por cola: un caso de otra cola no queda callado por el de precios.
  it('cada cola tiene su propia ventana de 5 minutos', async () => {
    await flag(reportId).expect(202);
    await relay();
    await post(reporter, '/product-requests', {
      name: 'Panela de la segunda cola',
      categoryCode: 'grains-groceries',
      quantity: 500,
      unit: 'g',
    }).expect(202);
    await relay();

    expect(bodies()).toEqual([
      'Hay casos nuevos para revisar en Precios',
      'Hay casos nuevos para revisar en Productos',
    ]);
  });

  // Fase 3 de #260: el resumen diario de commerce publica MerchantAlertsRaised y el comercio recibe un
  // aviso push, independiente del correo.
  const raise = async (accountId: string) => {
    await db.transaction(async (tx) => {
      await app
        .get(OutboxPublisher)
        .publish(tx, createEvent('MerchantAlertsRaised', 1, { accountId }));
    });
    await relay();
  };

  it('un comercio con avisos nuevos recibe un aviso genérico que lleva a Comercios', async () => {
    await post(merchant, '/notifications/subscriptions', {
      endpoint: 'https://push.example.net/comercio-telefono',
      keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
    }).expect(204);

    await raise(merchant.accountId);

    expect(sender.sent).toEqual([
      {
        endpoint: 'https://push.example.net/comercio-telefono',
        content: {
          title: 'Valora',
          body: 'Tienes avisos nuevos sobre tus precios',
          url: '/comercios',
          tag: 'comercio-avisos',
        },
      },
    ]);
  });

  // Pruebas de resguardo: ya pasan con el envío hecho.
  const subscribeMerchant = () =>
    post(merchant, '/notifications/subscriptions', {
      endpoint: 'https://push.example.net/comercio-telefono',
      keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
    }).expect(204);

  it('un segundo evento el mismo día no manda otro aviso al comercio', async () => {
    await subscribeMerchant();

    await raise(merchant.accountId);
    await raise(merchant.accountId);

    expect(sender.sent).toHaveLength(1);
  });

  it('una cuenta que no es comercio no recibe el aviso aunque llegue el evento', async () => {
    await post(reporter, '/notifications/subscriptions', {
      endpoint: 'https://push.example.net/reportante',
      keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'a'.repeat(22) },
    }).expect(403);

    await raise(reporter.accountId);

    expect(sender.sent).toEqual([]);
  });

  // EC-08: el id de la cuenta viaja en el evento pero no en el aviso.
  it('el aviso al comercio no lleva el id de su cuenta', async () => {
    await subscribeMerchant();

    await raise(merchant.accountId);

    expect(JSON.stringify(sender.sent)).not.toContain(merchant.accountId);
  });
});
