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
import { signIn } from '../support/sign-in';

// Producto, presentación y tiendas de prueba: solo existen dentro de esta prueba.
const productId = 'eb111111-1111-4111-8111-111111111111';
const presentationId = 'eb111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = (index: number) => `eb222222-2222-4222-8222-${String(index).padStart(12, '0')}`;

// RF-012 RN2 y grill de la #29, pregunta 3. Archivo propio: los límites de registro e inicio de
// sesión cuentan por IP y viven en memoria.
describe('ráfaga de punta a punta (#29)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, reliability.bursts, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    for (let index = 1; index <= 21; index += 1) {
      await app.get(ImportEstablishments).save({
        id: storeId(index),
        name: `Tienda ${String(index)}`,
        type: 'barrio',
        lat: 4.5339 + index * 0.0005,
        lng: -75.6811,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('20 reportes de una cuenta en una hora la frenan y llegan a la cola como ráfaga, sin datos de la cuenta', async () => {
    const reporter = await signIn(server, db, 'rafaga@correo.com');
    const moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
    const report = (index: number) =>
      request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          presentationId,
          establishmentId: storeId(index),
          priceCop: 4500,
          observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        });

    for (let index = 1; index <= 20; index += 1) await report(index).expect(201);
    const blocked = await report(21).expect(429);
    const relay = app.get(OutboxRelay);
    await relay.runOnce();
    await relay.runOnce();

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    const queue = await request(server)
      .get('/v1/moderation/queue')
      .query({ reason: 'rafaga', limit: '50' })
      .set('Cookie', moderator.cookie)
      .expect(200);
    const items = (queue.body as { items: { reason: string }[] }).items;
    expect(items).toHaveLength(20);
    expect(new Set(items.map((item) => item.reason))).toEqual(new Set(['rafaga']));
    // EC-08: ni la cola ni los eventos llevan la cuenta ni el correo de quien reportó.
    const events = await db.execute(sql`select payload from shared.outbox`);
    const everything = JSON.stringify([queue.body, events.rows]);
    expect(everything).not.toContain(reporter.accountId);
    expect(everything).not.toContain('rafaga@correo.com');
  });
});
