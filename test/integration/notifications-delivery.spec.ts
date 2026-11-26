import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
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
import { OutboxRelay } from '../../src/shared/events';
import { type SignedIn, signIn } from '../support/sign-in';

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    sender.sent = [];
    sender.down = false;
    await db.execute(
      sql`truncate notifications.push_subscriptions, notifications.sent_notices, reliability.observations, reliability.flags, reliability.moderation_log, reliability.reputations, shared.outbox, shared.processed_events`,
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
});
