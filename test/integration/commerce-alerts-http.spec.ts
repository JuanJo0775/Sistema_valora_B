import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { MerchantAlerts } from '../../src/modules/commerce/application/merchant-alerts';
import { SendMerchantDigests } from '../../src/modules/commerce/application/send-merchant-digests';
import { DrizzleMerchantNotices } from '../../src/modules/commerce/infrastructure/drizzle-merchant-notices';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'ce555555-5555-4555-8555-555555555555';
const productId = 'ce666666-6666-4666-8666-666666666666';
const riceId = 'ce666666-6666-4666-8666-aaaaaaaaaaaa';
const oilId = 'ce666666-6666-4666-8666-bbbbbbbbbbbb';
const STORE = { lat: 4.5339, lng: -75.6811 };

// B9 (#209), de punta a punta: vencimiento (D4) y discrepancia corroborada (ADR-008).
describe('avisos para el comercio por HTTP (#209)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let merchant: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.official_prices, commerce.merchant_notices, comparison.official_prices, comparison.price_current, pricing.reports, reliability.observations, reliability.reputations, reliability.reputation_events, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de los avisos',
      brand: 'Marca',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: riceId, quantity: 500, unit: 'g', packCount: 1 },
        { id: oilId, quantity: 1000, unit: 'g', packCount: 1 },
      ],
    });
    merchant = await signIn(server, db, 'comercio-avisos@correo.com');
    await request(server)
      .post('/v1/commerce/claims')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({
        establishmentId: storeId,
        responsibleName: 'Rosa Gómez',
        phone: '3001234567',
        acceptedTermsVersion: '2026-11',
        location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
      })
      .expect(201);
    await relay();
    for (const presentationId of [riceId, oilId]) {
      await request(server)
        .put('/v1/commerce/prices')
        .set('Cookie', merchant.cookie)
        .set('X-CSRF-Token', merchant.csrfToken)
        .send({ presentationId, priceCop: 2600 })
        .expect(200);
    }
    await relay();
    // El aceite se confirmó hace 13 días: vence mañana (14 días de vigencia).
    await db.execute(
      sql`update commerce.official_prices set confirmed_at = now() - interval '13 days' where presentation_id = ${oilId}`,
    );
    // Dos cuentas reportan el arroz más caro, después de publicado el oficial.
    for (const [email, priceCop] of [
      ['ana-avisos@correo.com', 3250],
      ['beto-avisos@correo.com', 3200],
    ] as const) {
      const reporter = await signIn(server, db, email);
      await request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          presentationId: riceId,
          establishmentId: storeId,
          priceCop,
          observedAt: new Date().toISOString(),
        })
        .expect(201);
      await relay();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function relay() {
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
  }

  it('GET /commerce/alerts: lo que vence mañana y la discrepancia, como dice el contrato', async () => {
    const response = await request(server)
      .get('/v1/commerce/alerts')
      .set('Cookie', merchant.cookie)
      .expect(200)
      .expect('Cache-Control', 'private, no-store');

    expect((response.body as { items: { kind: string }[] }).items.map((a) => a.kind)).toEqual([
      'vence_pronto',
      'discrepancia',
    ]);
    expect(response.body).toMatchObject({
      items: [
        { presentationId: oilId },
        { presentationId: riceId, officialPriceCop: 2600, reportedPriceCop: 3200, reports: 2 },
      ],
    });
    expect(contractErrors('GET /commerce/alerts', 200, response.body as unknown)).toEqual([]);
  });

  it('el resumen diario sale una vez con lo nuevo y no se repite', async () => {
    const sent: { accountId: string; subject: string }[] = [];
    const notices = new DrizzleMerchantNotices(db);
    // 8:00 a. m. en Colombia, para no depender de la hora en que corra la prueba.
    const morning = new Date(Date.now() - (new Date().getUTCHours() - 13) * 60 * 60 * 1000);
    const digests = new SendMerchantDigests({
      merchants: notices,
      alerts: app.get(MerchantAlerts),
      notices,
      notify: {
        send: (accountId, notice) => {
          sent.push({ accountId, subject: notice.subject });
          return Promise.resolve(true);
        },
      },
      clock: { now: () => morning },
    });

    await expect(digests.execute()).resolves.toEqual({ sent: 1 });
    await expect(digests.execute()).resolves.toEqual({ sent: 0 });

    expect(sent).toEqual([
      { accountId: merchant.accountId, subject: 'Tienes 2 avisos nuevos en Valora' },
    ]);
  });

  it('401 sin sesión; 403 un reportante', async () => {
    const reporter = await signIn(server, db, 'reportante-sin-tienda@correo.com');

    const responses = await Promise.all([
      request(server).get('/v1/commerce/alerts'),
      request(server).get('/v1/commerce/alerts').set('Cookie', reporter.cookie),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 403]);
  });
});
