import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { colombiaDate } from '../../src/domain/colombia-date';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { seedReferencePrices } from '../support/reference-prices';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'd1555555-5555-4555-8555-555555555555';
const riceProductId = 'd1666666-6666-4666-8666-666666666666';
const riceId = 'd1666666-6666-4666-8666-aaaaaaaaaaaa';
const oilProductId = 'd1666666-6666-4666-8666-777777777777';
const oilId = 'd1666666-6666-4666-8666-bbbbbbbbbbbb';
const saltProductId = 'd1666666-6666-4666-8666-888888888888';
const saltId = 'd1666666-6666-4666-8666-cccccccccccc';
const STORE = { lat: 4.5339, lng: -75.6811 };
const today = colombiaDate(new Date());
const inDays = (days: number) => colombiaDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
const note = 'El precio coincide con lo que se ve en la tienda';

interface QueueBody {
  items: { id: string; reason: string; productName: string; reportedPriceCop: number }[];
}

// H19 del informe de la prueba de usuario y ADR-037: los precios oficiales pasan por la misma
// detección de anómalos que los reportes de la comunidad (ADR-030), de punta a punta.
describe('plausibilidad de los precios oficiales por HTTP (H19, ADR-037)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let merchant: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.official_prices, commerce.official_price_reviews, commerce.promotions, comparison.official_prices, comparison.promotions, comparison.price_current, pricing.reports, reliability.observations, reliability.official_reviews, reliability.moderation_log, reliability.reputations, reliability.reputation_events, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: riceProductId,
      name: 'Arroz del precio oficial',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: riceId, quantity: 1, unit: 'kg', packCount: 1, barcode: '7702511555014' },
      ],
    });
    await app.get(ImportCatalog).save({
      id: oilProductId,
      name: 'Aceite sin referencia',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: oilId, quantity: 1000, unit: 'g', packCount: 1, barcode: '7707211555016' },
      ],
    });
    await app.get(ImportCatalog).save({
      id: saltProductId,
      name: 'Sal sin referencia',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: saltId, quantity: 500, unit: 'g', packCount: 1, barcode: '7701234555018' },
      ],
    });
    // Solo el arroz tiene tres tiendas de referencia, a $2.600; el aceite y la sal no tienen ninguna.
    await seedReferencePrices(app, {
      idPrefix: 'd1000001',
      presentationIds: [riceId],
      priceCop: 2600,
      near: STORE,
    });
    merchant = await signIn(server, db, 'comercio-plausible@correo.com');
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
    moderator = await signIn(server, db, 'moderadora-plausible@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate commerce.official_prices, commerce.official_price_reviews, commerce.promotions, comparison.official_prices, comparison.promotions, reliability.official_reviews, reliability.moderation_log, shared.outbox, shared.processed_events`,
    );
  });

  const relay = async () => {
    for (let round = 0; round < 3; round += 1) await app.get(OutboxRelay).runOnce();
  };
  const merchantCall = (method: 'put' | 'post' | 'get', path: string, body?: object) => {
    const call = request(server)[method](`/v1${path}`).set('Cookie', merchant.cookie);
    const signed = method === 'get' ? call : call.set('X-CSRF-Token', merchant.csrfToken);
    return body === undefined ? signed : signed.send(body);
  };
  const publish = (presentationId: string, priceCop: number) =>
    merchantCall('put', '/commerce/prices', { presentationId, priceCop });
  const list = () => merchantCall('get', '/commerce/prices');
  const upload = (...rows: string[]) =>
    request(server)
      .post('/v1/commerce/prices/bulk')
      .set('Content-Type', 'text/csv')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send(['codigo_barras;precio', ...rows].join('\r\n'));
  const compare = (productId: string) =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ lat: String(STORE.lat), lng: String(STORE.lng) });
  const queue = (query: Record<string, string> = {}) =>
    request(server).get('/v1/moderation/queue').query(query).set('Cookie', moderator.cookie);
  const decide = (itemId: string, decision: 'aprobar' | 'descartar') =>
    request(server)
      .post(`/v1/moderation/${itemId}/decision`)
      .set('Cookie', moderator.cookie)
      .set('X-CSRF-Token', moderator.csrfToken)
      .send({ decision, note });

  it('$300 y $52.000 por 1 kg de arroz, con referencia de $2.600, se rechazan con 422 y no se publica nada', async () => {
    const low = await publish(riceId, 300).expect(422);
    const high = await publish(riceId, 52_000).expect(422);
    await relay();

    for (const response of [low, high]) {
      expect(response.body).toEqual({
        code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
        message: expect.stringContaining(
          'Lo más barato que vemos es $2.600 y lo más caro $2.600',
        ) as unknown,
      });
    }
    const mine = await list().expect(200);
    expect(mine.body).toEqual({ items: [], inReview: [] });
    const comparison = await compare(riceProductId).expect(200);
    expect((comparison.body as { results: { source: string }[] }).results).not.toContainEqual(
      expect.objectContaining({ source: 'oficial' }),
    );
    await expect(
      db.execute(sql`select count(*)::int as total from commerce.official_prices`),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    expect(
      [low, high].flatMap((r) => contractErrors('PUT /commerce/prices', 422, r.body as unknown)),
    ).toEqual([]);
  });

  it('un precio dentro de rango se publica como oficial vigente, igual que antes', async () => {
    const response = await publish(riceId, 2700).expect(200);
    await relay();

    expect(response.body).toMatchObject({ priceCop: 2700, status: 'vigente' });
    const comparison = await compare(riceProductId).expect(200);
    expect(comparison.body).toMatchObject({
      results: [{ establishment: { id: storeId }, priceCop: 2700, source: 'oficial' }],
    });
  });

  it('sin referencia queda «en revisión»: no es oficial, entra a la cola y, al aprobarlo, se publica', async () => {
    const response = await publish(oilId, 300).expect(200);
    await relay();

    expect(response.body).toMatchObject({ priceCop: 300, status: 'en_revision' });
    const mine = await list().expect(200);
    expect(mine.body).toEqual({
      items: [],
      inReview: [
        {
          presentationId: oilId,
          productName: 'Aceite sin referencia Marca de prueba',
          presentationLabel: '1.000 g',
          priceCop: 300,
          submittedAt: expect.any(String) as unknown,
          status: 'en_revision',
        },
      ],
    });
    // No sale en la comparación como oficial ni como titular «Más barato».
    const before = await compare(oilProductId).expect(200);
    expect((before.body as { results: unknown[] }).results).toEqual([]);
    const pending = await queue().expect(200);
    expect(pending.body).toEqual({
      items: [
        {
          id: expect.any(String) as unknown,
          reason: 'sin_referencia',
          productName: expect.any(String) as unknown,
          establishmentName: 'Tienda La Esperanza',
          reportedPriceCop: 300,
          reportersCount: 0,
          createdAt: expect.any(String) as unknown,
        },
      ],
    });
    expect(contractErrors('GET /moderation/queue', 200, pending.body as unknown)).toEqual([]);
    const [item] = (pending.body as QueueBody).items;

    await decide(item?.id ?? '', 'aprobar').expect(204);
    await relay();

    const approved = await list().expect(200);
    expect(approved.body).toMatchObject({
      items: [{ presentationId: oilId, priceCop: 300, freshness: 'vigente' }],
      inReview: [],
    });
    const after = await compare(oilProductId).expect(200);
    expect(after.body).toMatchObject({
      results: [{ establishment: { id: storeId }, priceCop: 300, source: 'oficial' }],
    });
    expect((await queue().expect(200)).body).toEqual({ items: [] });
  });

  it('si moderación lo descarta, se retira: nunca fue oficial', async () => {
    await publish(saltId, 200).expect(200);
    await relay();
    const [item] = ((await queue({ reason: 'sin_referencia' }).expect(200)).body as QueueBody)
      .items;

    await decide(item?.id ?? '', 'descartar').expect(204);
    await relay();

    expect((await list().expect(200)).body).toEqual({ items: [], inReview: [] });
    const comparison = await compare(saltProductId).expect(200);
    expect((comparison.body as { results: unknown[] }).results).toEqual([]);
    expect((await queue().expect(200)).body).toEqual({ items: [] });
  });

  it('enviar otro precio reemplaza al que esperaba: la cola solo tiene el último', async () => {
    await publish(saltId, 200).expect(200);
    await relay();
    await publish(saltId, 2300).expect(200);
    await relay();

    const pending = (await queue().expect(200)).body as QueueBody;

    expect(pending.items.map((item) => item.reportedPriceCop)).toEqual([2300]);
    const mine = (await list().expect(200)).body as { inReview: { priceCop: number }[] };
    expect(mine.inReview.map((item) => item.priceCop)).toEqual([2300]);
  });

  describe('carga por archivo', () => {
    it('las filas fuera de rango salen como errores por fila y las «en revisión», aparte', async () => {
      const response = await upload(
        '7702511555014;300',
        '7707211555016;8900',
        '7702511555014;2600',
      );
      await relay();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        published: 0,
        inReview: [{ row: 3, barcode: '7707211555016', priceCop: 8900 }],
        errors: [
          {
            row: 2,
            barcode: '7702511555014',
            code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
            message: expect.stringContaining(
              'Lo más barato que vemos es $2.600 y lo más caro $2.600',
            ) as unknown,
          },
          expect.objectContaining({ row: 4, code: 'DUPLICATE_ROW' }),
        ],
      });
      expect(contractErrors('POST /commerce/prices/bulk', 200, response.body as unknown)).toEqual(
        [],
      );
      const pending = (await queue().expect(200)).body as QueueBody;
      expect(pending.items).toEqual([
        expect.objectContaining({ reason: 'sin_referencia', reportedPriceCop: 8900 }),
      ]);
    });
  });

  describe('promociones', () => {
    const promotion = (change: object) => ({
      presentationId: riceId,
      type: 'precio_especial',
      conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
      validFrom: today,
      validUntil: inDays(7),
      ...change,
    });

    it('un precio especial por debajo del 40 % de la mediana ($1.040) se rechaza con 422', async () => {
      await publish(riceId, 2700).expect(200);

      const rejected = await merchantCall(
        'post',
        '/commerce/promotions',
        promotion({ specialPriceCop: 1039 }),
      ).expect(422);
      const accepted = await merchantCall(
        'post',
        '/commerce/promotions',
        promotion({ specialPriceCop: 1040 }),
      ).expect(201);

      expect(rejected.body).toEqual({
        code: 'IMPLAUSIBLE_OFFICIAL_PRICE',
        message: expect.stringContaining(
          'Con esta promoción el precio quedaría en $1.039',
        ) as unknown,
      });
      expect(accepted.body).toMatchObject({ promotedPriceCop: 1040 });
    });

    it('un descuento del 90 % que deja el precio por debajo del piso también se rechaza', async () => {
      await publish(riceId, 2700).expect(200);

      const rejected = await merchantCall(
        'post',
        '/commerce/promotions',
        promotion({ type: 'descuento_porcentual', percent: 90 }),
      ).expect(422);

      expect(rejected.body).toMatchObject({ code: 'IMPLAUSIBLE_OFFICIAL_PRICE' });
    });
  });
});
