import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportInitialPrices } from '../../src/modules/comparison';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { type SignedIn, signIn } from '../support/sign-in';

// EC-03 (ADR-030): el caso de la auditoría. Un precio de $12 por 1 kg de arroz, con 1.990 en otras
// tiendas, ya no se acepta (piso de $100); uno atípico pero posible queda en revisión y nunca es el
// titular «Más barato».
const productId = 'b7777777-7777-4777-8777-222222222222';
const presentationId = 'b7777777-7777-4777-8777-bbbbbbbbbbbb';
const ownStore = 'b8888888-8888-4888-8888-000000000000';
const peerStores = [1, 2, 3].map((n) => `b8888888-8888-4888-8888-00000000000${String(n)}`);
const userLocation = { lat: '4.5339', lng: '-75.6811' };

interface ComparisonBody {
  results: { reportId: string; priceCop: number; isCheapest: boolean; reliability: string }[];
}

describe('plausibilidad del precio de punta a punta (EC-03, ADR-030)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let relay: OutboxRelay;
  let ana: SignedIn;
  let beto: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    relay = app.get(OutboxRelay);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    await db.execute(
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, reliability.official_reviews, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 1, unit: 'kg', packCount: 1 }],
    });
    for (const [index, id] of [ownStore, ...peerStores].entries()) {
      await app.get(ImportEstablishments).save({
        id,
        name: `Tienda ${String(index)}`,
        type: 'barrio',
        lat: 4.535 + index * 0.0005,
        lng: -75.6811,
      });
    }
    ana = await signIn(server, db, 'ana@correo.com');
    beto = await signIn(server, db, 'beto@correo.com');
    moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, comparison.price_history, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals`,
    );
    // Datos iniciales de la semilla: 1.990 en tres tiendas, sin cuenta reportante.
    await app.get(ImportInitialPrices).execute(
      peerStores.map((establishmentId, index) => ({
        id: `b9999999-9999-4999-8999-00000000000${String(index)}`,
        presentationId,
        establishmentId,
        priceCop: 1990,
        observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        sourceUrl: 'https://ejemplo.test/arroz',
      })),
    );
  });

  const post = (as: SignedIn, path: string, body: object, headers: Record<string, string> = {}) =>
    request(server)
      .post(path)
      .set('Cookie', as.cookie)
      .set('X-CSRF-Token', as.csrfToken)
      .set(headers)
      .send(body);

  const report = (
    as: SignedIn,
    priceCop: number,
    key = crypto.randomUUID(),
    observedAt = new Date(Date.now() - 5 * 60 * 1000),
  ) =>
    post(
      as,
      '/v1/reports',
      {
        presentationId,
        establishmentId: ownStore,
        priceCop,
        observedAt: observedAt.toISOString(),
      },
      { 'Idempotency-Key': key },
    );

  const settle = async () => {
    await relay.runOnce();
    await relay.runOnce();
  };

  const compare = async () =>
    (
      await request(server)
        .get(`/v1/products/${productId}/comparison`)
        .query(userLocation)
        .expect(200)
    ).body as ComparisonBody;

  const currentOfOwnStore = async () =>
    (
      await db.execute<{ status: string; price_cop: number }>(
        sql`select status, price_cop from comparison.price_current where establishment_id = ${ownStore}`,
      )
    ).rows;

  const queue = async () =>
    (await request(server).get('/v1/moderation/queue').set('Cookie', moderator.cookie).expect(200))
      .body as { items: { id: string; reason: string; reportedPriceCop: number }[] };

  it('$700 por 1 kg con 1.990 en otras tiendas (35 %): se guarda en revisión, no es titular y va a la cola', async () => {
    const response = await report(ana, 700).expect(201);
    await settle();
    const id = (response.body as { id: string }).id;

    expect(await currentOfOwnStore()).toEqual([{ status: 'en_revision', price_cop: 700 }]);
    const comparison = await compare();
    const mine = comparison.results.find((item) => item.reportId === id);
    expect(mine).toMatchObject({ isCheapest: false, reliability: 'en_revision' });
    expect(
      comparison.results.filter((item) => item.isCheapest).map((item) => item.priceCop),
    ).toEqual([1990, 1990, 1990]);
    expect((await queue()).items).toEqual([
      expect.objectContaining({ id, reason: 'desviacion', reportedPriceCop: 700 }),
    ]);
    const mine2 = await request(server).get('/v1/me/reports').set('Cookie', ana.cookie).expect(200);
    expect(mine2.body).toMatchObject({ items: [{ reportId: id, status: 'en_revision' }] });
  });

  it('el moderador aprueba el atípico y pasa a vigente; descartarlo lo retira', async () => {
    const response = await report(ana, 700).expect(201);
    await settle();
    const id = (response.body as { id: string }).id;

    await post(moderator, `/v1/moderation/${id}/decision`, {
      decision: 'aprobar',
      note: 'Oferta real verificada en la tienda',
    }).expect(204);
    await settle();

    expect(await currentOfOwnStore()).toEqual([{ status: 'vigente', price_cop: 700 }]);
    expect((await compare()).results.find((item) => item.reportId === id)?.isCheapest).toBe(true);
  });

  it('con un dato inicial en esa tienda, el atípico no lo reemplaza', async () => {
    await app.get(ImportInitialPrices).execute([
      {
        id: 'b9999999-9999-4999-8999-0000000000ff',
        presentationId,
        establishmentId: ownStore,
        priceCop: 2000,
        observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        sourceUrl: 'https://ejemplo.test/arroz',
      },
    ]);

    await report(ana, 500).expect(201);
    await settle();

    expect(await currentOfOwnStore()).toEqual([{ status: 'vigente', price_cop: 2000 }]);
    expect((await queue()).items).toHaveLength(1);
  });

  it('$50 y $99 se rechazan con 422 IMPLAUSIBLE_PRICE y no se guarda nada', async () => {
    for (const priceCop of [50, 99, 5_000_001]) {
      const response = await report(ana, priceCop).expect(422);
      expect(response.body).toMatchObject({ code: 'IMPLAUSIBLE_PRICE' });
    }
    await settle();

    const stored = await db.execute(sql`select count(*)::int as total from pricing.reports`);
    expect(stored.rows).toEqual([{ total: 0 }]);
    const outbox = await db.execute(sql`select count(*)::int as total from shared.outbox`);
    expect(outbox.rows).toEqual([{ total: 0 }]);
  });

  it('el mensaje del 422 está en español', async () => {
    const response = await report(ana, 12).expect(422);

    expect((response.body as { message: string }).message).toBe(
      'El precio parece incompleto: ningún producto cuesta menos de $100. Revisa si faltan ceros.',
    );
  });

  it('un precio normal sigue pasando y es vigente', async () => {
    await report(ana, 1800).expect(201);
    await settle();

    expect(await currentOfOwnStore()).toEqual([{ status: 'vigente', price_cop: 1800 }]);
    expect((await queue()).items).toEqual([]);
    expect((await compare()).results.find((item) => item.priceCop === 1800)?.isCheapest).toBe(true);
  });

  it('repetir con la misma Idempotency-Key devuelve el mismo recibo, también para un atípico', async () => {
    const key = crypto.randomUUID();
    const observedAt = new Date(Date.now() - 5 * 60 * 1000);
    const first = await report(ana, 700, key, observedAt).expect(201);
    await settle();

    const retry = await report(ana, 700, key, observedAt).expect(200);
    await settle();

    expect(retry.body).toEqual(first.body);
    const stored = await db.execute(sql`select count(*)::int as total from pricing.reports`);
    expect(stored.rows).toEqual([{ total: 1 }]);
  });

  it('un reporte vigente que otra cuenta marca deja de ser el titular «Más barato»', async () => {
    // Caso de la auditoría: el precio siguió siendo el titular después de marcarse.
    const response = await report(ana, 1800).expect(201);
    await settle();
    const id = (response.body as { id: string }).id;
    expect((await compare()).results.find((item) => item.reportId === id)?.isCheapest).toBe(true);

    await post(beto, `/v1/reports/${id}/flag`, { reason: 'precio_falso' }).expect(202);
    await settle();

    expect(await currentOfOwnStore()).toEqual([{ status: 'en_revision', price_cop: 1800 }]);
    const after = (await compare()).results.find((item) => item.reportId === id);
    expect(after).toMatchObject({ isCheapest: false, reliability: 'en_revision' });
  });

  it('si el moderador aprueba el reporte marcado, vuelve a ser vigente', async () => {
    const response = await report(ana, 1800).expect(201);
    await settle();
    const id = (response.body as { id: string }).id;
    await post(beto, `/v1/reports/${id}/flag`, { reason: 'precio_falso' }).expect(202);
    await settle();

    await post(moderator, `/v1/moderation/${id}/decision`, {
      decision: 'aprobar',
      note: 'El precio coincide con la etiqueta',
    }).expect(204);
    await settle();

    expect(await currentOfOwnStore()).toEqual([{ status: 'vigente', price_cop: 1800 }]);
  });
});
