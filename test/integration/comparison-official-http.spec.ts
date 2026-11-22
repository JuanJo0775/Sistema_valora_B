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
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c4555555-5555-4555-8555-555555555555';
const productId = 'c4666666-6666-4666-8666-666666666666';
const riceId = 'c4666666-6666-4666-8666-aaaaaaaaaaaa';
const STORE = { lat: 4.5339, lng: -75.6811 };

// D1 del grill comercial (#204), de punta a punta: commerce → outbox → comparison, y los reportes de
// la comunidad por pricing → reliability → comparison.
describe('comparación con precio oficial por HTTP (#204)', () => {
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
      sql`truncate identity.email_verifications, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.official_prices, comparison.official_prices, comparison.price_current, pricing.reports, reliability.observations, reliability.reputations, reliability.reputation_events, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de la comparación oficial',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [{ id: riceId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    merchant = await signIn(server, db, 'comercio-comparacion@correo.com');
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
    await app.get(OutboxRelay).runOnce();
  });

  afterAll(async () => {
    await app.close();
  });

  const relay = async () => {
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
  };
  const compare = () =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ lat: String(STORE.lat), lng: String(STORE.lng) });
  const report = async (email: string, priceCop: number, minutesAgo: number) => {
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
        observedAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      })
      .expect(201);
    await relay();
  };

  it('el oficial publicado sale en la comparación; con dos reportes que lo contradicen entra la mediana', async () => {
    await request(server)
      .put('/v1/commerce/prices')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({ presentationId: riceId, priceCop: 2600 })
      .expect(200);
    await relay();

    const official = await compare().expect(200);

    expect(official.body).toMatchObject({
      results: [{ establishment: { id: storeId }, priceCop: 2600, source: 'oficial' }],
    });
    expect((official.body as { results: object[] }).results[0]).not.toHaveProperty('reportId');

    // Vistos después de publicar el oficial: los de antes no cuentan (D1).
    await report('ana-oficial@correo.com', 3250, 0);
    await report('beto-oficial@correo.com', 3200, 0);
    const disputed = await compare().expect(200);

    expect(disputed.body).toMatchObject({
      results: [
        {
          establishment: { id: storeId },
          priceCop: 3200,
          source: 'comunidad',
          reportId: expect.any(String) as unknown,
          discrepancy: { officialPriceCop: 2600, reportedPriceCop: 3200, reports: 2 },
        },
      ],
    });
    expect([
      ...contractErrors('GET /products/:productId/comparison', 200, official.body as unknown),
      ...contractErrors('GET /products/:productId/comparison', 200, disputed.body as unknown),
    ]).toEqual([]);
  });
});
