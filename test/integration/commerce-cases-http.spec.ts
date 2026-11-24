import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { PurgeDeletedAccounts } from '../../src/modules/identity/application/purge-deleted-accounts';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { seedReferencePrices } from '../support/reference-prices';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'cc555555-5555-4555-8555-555555555555';
const productId = 'cc666666-6666-4666-8666-666666666666';
const riceId = 'cc666666-6666-4666-8666-aaaaaaaaaaaa';
const STORE = { lat: 4.5339, lng: -75.6811 };
const claimBody = {
  establishmentId: storeId,
  responsibleName: 'Rosa Gómez',
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
};

// D2, D3 y ADR-032 (#208), de punta a punta.
describe('denuncias, disputas y revocación por HTTP (#208)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let merchant: SignedIn;
  let ana: SignedIn;
  let luis: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.official_prices, commerce.promotions, comparison.official_prices, comparison.promotions, comparison.price_current, shared.outbox, shared.processed_events, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de los casos',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [{ id: riceId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    // ADR-037: el precio oficial se compara con otras tres tiendas del municipio.
    await seedReferencePrices(app, {
      idPrefix: 'cc000001',
      presentationIds: [riceId],
      priceCop: 2600,
      near: STORE,
    });
    merchant = await signIn(server, db, 'comercio-casos@correo.com');
    ana = await signIn(server, db, 'ana-casos@correo.com');
    luis = await signIn(server, db, 'luis-casos@correo.com');
    moderator = await signIn(server, db, 'moderadora-casos@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  const relay = async () => {
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
  };
  const post = (as: SignedIn | null, path: string, body: object) => {
    const call = request(server).post(`/v1${path}`).send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const roleOf = async (as: SignedIn) =>
    (
      (await request(server).get('/v1/auth/session').set('Cookie', as.cookie)).body as {
        role: string;
      }
    ).role;
  const compare = () =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ lat: String(STORE.lat), lng: String(STORE.lng) });

  it('denuncia y disputa llegan al moderador; revocar retira el oficial, devuelve el rol y no deja volver a registrar', async () => {
    await post(merchant, '/commerce/claims', claimBody).expect(201);
    await relay();
    await request(server)
      .put('/v1/commerce/prices')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({ presentationId: riceId, priceCop: 2600 })
      .expect(200);
    await relay();
    expect((await compare().expect(200)).body).toMatchObject({ results: [{ source: 'oficial' }] });

    const eligibility = () =>
      request(server)
        .get(`/v1/establishments/${storeId}/merchant-reports`)
        .set('Cookie', ana.cookie)
        .expect(200);
    expect((await eligibility()).body).toEqual({ canReport: true });
    const reported = await post(ana, `/establishments/${storeId}/merchant-reports`, {
      reason: 'El dueño real de la tienda es don Luis.',
    }).expect(202);
    // H31: con una denuncia abierta, la consulta ya no ofrece denunciar y lo dice.
    const afterReport = await eligibility();
    expect(afterReport.body).toEqual({ canReport: false, alreadyReported: true });
    expect(
      contractErrors(
        'GET /establishments/:establishmentId/merchant-reports',
        200,
        afterReport.body as unknown,
      ),
    ).toEqual([]);
    // Luis está en la tienda e intenta registrarla: 409 y queda una disputa.
    await post(luis, '/commerce/claims', claimBody).expect(409);

    const queue = await request(server)
      .get('/v1/moderation/merchant-cases')
      .set('Cookie', moderator.cookie)
      .expect(200);
    const items = (queue.body as { items: { id: string; kind: string }[] }).items;
    expect(items.map((item) => item.kind).sort()).toEqual(['denuncia', 'disputa']);
    expect(JSON.stringify(queue.body)).not.toContain(ana.accountId);
    expect(JSON.stringify(queue.body)).not.toContain(merchant.accountId);
    expect([
      ...contractErrors(
        'POST /establishments/:establishmentId/merchant-reports',
        202,
        reported.body as unknown,
      ),
      ...contractErrors('GET /moderation/merchant-cases', 200, queue.body as unknown),
    ]).toEqual([]);

    await post(moderator, `/moderation/merchant-cases/${items[0]?.id ?? ''}/decision`, {
      decision: 'revocar',
      note: 'Confirmado con el dueño real: suplantación',
    }).expect(204);
    await relay();

    expect(await roleOf(merchant)).toBe('reportante');
    expect((await compare().expect(200)).body).toMatchObject({ results: [] });
    const me = await request(server).get('/v1/commerce/me').set('Cookie', merchant.cookie);
    // H15: la nota del moderador queda en la bitácora; la cuenta ve un mensaje estándar.
    expect(me.body).toMatchObject({
      status: 'revocado',
      reason: 'Moderación revocó el registro de esta cuenta para esa tienda.',
    });
    expect(JSON.stringify(me.body)).not.toContain('suplantación');
    expect(contractErrors('GET /commerce/me', 200, me.body as unknown)).toEqual([]);
    const pending = await request(server)
      .get('/v1/moderation/merchant-cases')
      .set('Cookie', moderator.cookie)
      .expect(200);
    expect((pending.body as { items: unknown[] }).items).toEqual([]);
    const again = await post(merchant, '/commerce/claims', claimBody).expect(422);
    expect((again.body as { code: string }).code).toBe('REVOKED_FROM_ESTABLISHMENT');
  });

  it('400 con un motivo corto; 404 si la tienda no tiene comercio; 401 sin sesión; 403 un reportante en la cola', async () => {
    const responses = await Promise.all([
      post(ana, `/establishments/${storeId}/merchant-reports`, { reason: 'corto' }),
      post(ana, '/establishments/cc999999-9999-4999-8999-999999999999/merchant-reports', {
        reason: 'El dueño real de la tienda es don Luis.',
      }),
      post(null, `/establishments/${storeId}/merchant-reports`, {
        reason: 'El dueño real es otro.',
      }),
      request(server).get('/v1/moderation/merchant-cases').set('Cookie', ana.cookie),
    ]);

    expect(responses.map((r) => r.status)).toEqual([400, 404, 401, 403]);
  });

  // ADR-032 con el hallazgo de B7: borrar la cuenta de un comercio no deja nada suyo en commerce.
  it('al borrar la cuenta de un comercio no queda su nombre, su teléfono ni su cuenta, y se retira su oficial', async () => {
    // Luis no tenía tienda: la registra y publica su oficial.
    await post(luis, '/commerce/claims', claimBody).expect(201);
    await relay();
    await request(server)
      .put('/v1/commerce/prices')
      .set('Cookie', luis.cookie)
      .set('X-CSRF-Token', luis.csrfToken)
      .send({ presentationId: riceId, priceCop: 2700 })
      .expect(200);
    await relay();
    // Su eliminación ya venció (ADR-032: 10 días de gracia).
    await db.execute(
      sql`update identity.accounts set deletion_scheduled_for = now() - interval '1 day' where id = ${luis.accountId}`,
    );

    await expect(app.get(PurgeDeletedAccounts).execute()).resolves.toMatchObject({ purged: 1 });
    await relay();

    const left = await db.execute<{ total: string }>(
      sql`select (select count(*) from commerce.merchant_claims where account_id = ${luis.accountId})
              + (select count(*) from commerce.merchant_claim_rejections where account_id = ${luis.accountId})
              + (select count(*) from commerce.merchant_claims where phone = '3001234567')
              + (select count(*) from commerce.official_prices where establishment_id = ${storeId})
              as total`,
    );
    expect(left.rows[0]?.total).toBe('0');
    expect((await compare().expect(200)).body).toMatchObject({ results: [] });
  });
});
