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
import { colombiaDate } from '../../src/domain/colombia-date';
import { contractErrors } from '../support/contract';
import { seedReferencePrices } from '../support/reference-prices';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const catalogStoreId = 'a3611111-1111-4111-8111-111111111111';
const productId = 'a3622222-2222-4222-8222-222222222222';
const riceId = 'a3622222-2222-4222-8222-aaaaaaaaaaaa';
const CATALOG_STORE = { lat: 4.5339, lng: -75.6811 };
const NEW_STORE = { lat: 4.4613, lng: -75.6674 };
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => colombiaDate(new Date(Date.now() + days * DAY));
const claimCatalogStore = {
  establishmentId: catalogStoreId,
  responsibleName: 'Rosa Gómez',
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  location: { lat: CATALOG_STORE.lat + 0.00018, lng: CATALOG_STORE.lng },
};
const claimNewStore = {
  newEstablishment: { name: 'Tienda El Paraíso', type: 'barrio', municipality: 'armenia' },
  responsibleName: 'Luis Ramírez',
  phone: '3157654321',
  acceptedTermsVersion: '2026-11',
  location: NEW_STORE,
};

// H36: dejar de administrar la tienda y eliminar la tienda propia, de punta a punta.
describe('dejar y eliminar la tienda por HTTP (H36, ADR-040)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let moderator: SignedIn;
  let ana: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate pricing.reports, identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.official_prices, commerce.promotions, comparison.official_prices, comparison.promotions, comparison.price_current, comparison.price_history, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, shared.outbox, shared.processed_events, establishments.store_proposals, establishments.establishments, catalog.presentations, catalog.products, catalog.product_aliases, catalog.wholesale_references`,
    );
    await app.get(ImportEstablishments).save({
      id: catalogStoreId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...CATALOG_STORE,
    });
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de la salida',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [{ id: riceId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    // ADR-037: el precio oficial se compara con otras tres tiendas del municipio.
    await seedReferencePrices(app, {
      idPrefix: 'a3600001',
      presentationIds: [riceId],
      priceCop: 2600,
      near: CATALOG_STORE,
    });
    await seedReferencePrices(app, {
      idPrefix: 'a3600002',
      presentationIds: [riceId],
      priceCop: 2600,
      near: NEW_STORE,
    });
    moderator = await signIn(server, db, 'moderadora-salida@correo.com', 'moderador');
    ana = await signIn(server, db, 'ana-salida@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  const relay = async () => {
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
  };
  const send = (
    as: SignedIn | null,
    method: 'post' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const call = request(server)[method](`/v1${path}`);
    const signed = as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
    return body === undefined ? signed : signed.send(body);
  };
  const roleOf = async (as: SignedIn) =>
    (
      (await request(server).get('/v1/auth/session').set('Cookie', as.cookie)).body as {
        role: string;
      }
    ).role;
  const compare = (at: { lat: number; lng: number }) =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ lat: String(at.lat), lng: String(at.lng) });
  const search = (q: string) => request(server).get('/v1/establishments').query({ q });
  const publishPrice = (as: SignedIn, priceCop: number) =>
    send(as, 'put', '/commerce/prices', { presentationId: riceId, priceCop }).expect(200);
  // El moderador aprueba la tienda propuesta y el comercio queda verificado.
  const registerNewStore = async (as: SignedIn): Promise<string> => {
    const claimed = await send(as, 'post', '/commerce/claims', claimNewStore).expect(201);
    const { establishmentId } = claimed.body as { establishmentId: string };
    await send(moderator, 'post', `/moderation/store-proposals/${establishmentId}/decision`, {
      decision: 'aprobar',
      note: 'Revisada por la moderación',
    }).expect(204);
    await relay();
    return establishmentId;
  };
  const accountCleanup = async (as: SignedIn) => {
    await db.execute(
      sql`update identity.accounts set deletion_scheduled_for = now() - interval '1 day' where id = ${as.accountId}`,
    );
    await expect(app.get(PurgeDeletedAccounts).execute()).resolves.toMatchObject({ purged: 1 });
    await relay();
  };
  const commerceRowsOf = async (accountId: string) =>
    (
      await db.execute<{ total: string }>(
        sql`select (select count(*) from commerce.merchant_claims where account_id = ${accountId})
              + (select count(*) from commerce.merchant_claim_rejections where account_id = ${accountId})
              as total`,
      )
    ).rows[0]?.total;

  it('dejar la tienda: vuelve a reportante, retira oficial y promociones, la tienda sigue en el mapa y se puede volver a reclamar', async () => {
    const rosa = await signIn(server, db, 'rosa-salida@correo.com');
    await send(rosa, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await relay();
    await publishPrice(rosa, 2600);
    await send(rosa, 'post', '/commerce/promotions', {
      presentationId: riceId,
      type: 'descuento_porcentual',
      percent: 20,
      conditions: { maxPerCustomer: 2, whileStocksLast: true, paymentMethod: 'efectivo' },
      validFrom: colombiaDate(new Date()),
      validUntil: inDays(7),
    }).expect(201);
    await relay();
    expect((await compare(CATALOG_STORE).expect(200)).body).toMatchObject({
      results: [{ source: 'oficial' }],
      promotions: [{ establishment: { id: catalogStoreId } }],
    });

    const left = await send(rosa, 'post', '/commerce/me/leave').expect(200);
    await relay();

    expect(left.body).toEqual({ status: 'dejada', establishmentId: catalogStoreId });
    expect(contractErrors('POST /commerce/me/leave', 200, left.body as unknown)).toEqual([]);
    // La sesión sigue viva y el rol ya es reportante.
    expect(await roleOf(rosa)).toBe('reportante');
    const after = (await compare(CATALOG_STORE).expect(200)).body as {
      results: unknown[];
      promotions: unknown[];
    };
    expect(after.results).toEqual([]);
    expect(after.promotions).toEqual([]);
    // La tienda sigue en el mapa como tienda de la comunidad, sin dueño ni marca de revocación.
    const found = await search('esperanza').expect(200);
    expect(JSON.stringify(found.body)).toContain(catalogStoreId);
    await request(server).get('/v1/commerce/me').set('Cookie', rosa.cookie).expect(404);
    expect(await commerceRowsOf(rosa.accountId)).toBe('0');
    // No bloquea volver a reclamar: queda verificada otra vez.
    await send(rosa, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await relay();
    expect(await roleOf(rosa)).toBe('comercio');
    // Deja la tienda libre para las otras pruebas.
    await send(rosa, 'post', '/commerce/me/leave').expect(200);
    await relay();
  });

  it('dejar la tienda es idempotente: repetirlo, o hacerlo sin tienda, responde 200 sin_tienda', async () => {
    const pepe = await signIn(server, db, 'pepe-salida@correo.com');
    await send(pepe, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await relay();

    await send(pepe, 'post', '/commerce/me/leave').expect(200);
    const again = await send(pepe, 'post', '/commerce/me/leave').expect(200);
    await relay();
    const never = await send(ana, 'post', '/commerce/me/leave').expect(200);

    expect(again.body).toEqual({ status: 'sin_tienda' });
    expect(never.body).toEqual({ status: 'sin_tienda' });
    expect(await roleOf(pepe)).toBe('reportante');
    const changes = await db.execute<{ total: string }>(
      sql`select count(*) as total from identity.role_changes where account_id = ${pepe.accountId} and to_role = 'reportante'`,
    );
    expect(changes.rows[0]?.total).toBe('1');
  });

  it('eliminar la tienda propia: desaparece de la búsqueda y la comparación, se conservan sus reportes y se puede reclamar otra', async () => {
    const luis = await signIn(server, db, 'luis-salida@correo.com');
    const storeId = await registerNewStore(luis);
    expect(await roleOf(luis)).toBe('comercio');
    await publishPrice(luis, 2600);
    // Un reporte de la comunidad en la tienda nueva.
    await send(
      ana,
      'post',
      '/reports',
      {
        presentationId: riceId,
        establishmentId: storeId,
        priceCop: 2650,
        observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    )
      .set('Idempotency-Key', crypto.randomUUID())
      .expect(201);
    await relay();
    expect(JSON.stringify((await search('paraíso').expect(200)).body)).toContain(storeId);
    expect(((await compare(NEW_STORE).expect(200)).body as { results: unknown[] }).results).not.toEqual(
      [],
    );

    await send(luis, 'delete', '/commerce/establishment').expect(204);
    await relay();

    expect(await roleOf(luis)).toBe('reportante');
    expect(JSON.stringify((await search('paraíso').expect(200)).body)).not.toContain(storeId);
    expect(((await compare(NEW_STORE).expect(200)).body as { results: unknown[] }).results).toEqual(
      [],
    );
    await request(server).get(`/v1/establishments/${storeId}/prices`).expect(404);
    // Borrado lógico: la tienda queda «retirada» y los reportes de la comunidad se conservan.
    const kept = await db.execute<{ status: string; reports: string }>(
      sql`select e.status, (select count(*) from pricing.reports where establishment_id = e.id) as reports
          from establishments.establishments e where e.id = ${storeId}`,
    );
    expect(kept.rows[0]).toEqual({ status: 'retirada', reports: '1' });
    // Repetir la eliminación ya no encuentra tienda (404) y nada cambia.
    await send(luis, 'delete', '/commerce/establishment').expect(404);
    // No queda atado: puede registrar otra tienda.
    await send(luis, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await send(luis, 'post', '/commerce/me/leave').expect(200);
  });

  it('una tienda del catálogo no se elimina: 403 ESTABLISHMENT_NOT_CREATED_BY_ACCOUNT y nada cambia', async () => {
    const marta = await signIn(server, db, 'marta-salida@correo.com');
    await send(marta, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await relay();
    await publishPrice(marta, 2600);
    await relay();

    const refused = await send(marta, 'delete', '/commerce/establishment').expect(403);
    await relay();

    expect((refused.body as { code: string }).code).toBe('ESTABLISHMENT_NOT_CREATED_BY_ACCOUNT');
    expect(await roleOf(marta)).toBe('comercio');
    expect(JSON.stringify((await search('esperanza').expect(200)).body)).toContain(catalogStoreId);
    expect((await compare(CATALOG_STORE).expect(200)).body).toMatchObject({
      results: [{ source: 'oficial' }],
    });
    await send(marta, 'post', '/commerce/me/leave').expect(200);
    await relay();
  });

  it('la tienda de una cuenta que la creó y otra reclamó después ya no es suya: no la puede eliminar', async () => {
    const olga = await signIn(server, db, 'olga-salida@correo.com');
    const storeId = await registerNewStore(olga);
    await send(olga, 'post', '/commerce/me/leave').expect(200);
    await relay();
    const nora = await signIn(server, db, 'nora-salida@correo.com');
    await send(nora, 'post', '/commerce/claims', {
      ...claimNewStore,
      newEstablishment: undefined,
      establishmentId: storeId,
    }).expect(201);
    await relay();

    const refused = await send(nora, 'delete', '/commerce/establishment').expect(403);

    expect((refused.body as { code: string }).code).toBe('ESTABLISHMENT_NOT_CREATED_BY_ACCOUNT');
    await send(nora, 'post', '/commerce/me/leave').expect(200);
    await relay();
  });

  it('401 sin sesión y 403 a un moderador, en las dos acciones', async () => {
    const responses = await Promise.all([
      send(null, 'post', '/commerce/me/leave'),
      send(null, 'delete', '/commerce/establishment'),
      send(moderator, 'post', '/commerce/me/leave'),
      send(moderator, 'delete', '/commerce/establishment'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
  });

  // ADR-032: la pantalla de eliminar la cuenta sigue funcionando con una tienda dejada o eliminada.
  it('borrar la cuenta tras dejar la tienda, o tras eliminarla, termina bien y no deja nada en commerce', async () => {
    const vera = await signIn(server, db, 'vera-salida@correo.com');
    await send(vera, 'post', '/commerce/claims', claimCatalogStore).expect(201);
    await relay();
    await send(vera, 'post', '/commerce/me/leave').expect(200);
    await relay();
    await accountCleanup(vera);
    expect(await commerceRowsOf(vera.accountId)).toBe('0');

    const dario = await signIn(server, db, 'dario-salida@correo.com');
    const storeId = await registerNewStore(dario);
    await send(dario, 'delete', '/commerce/establishment').expect(204);
    await relay();
    await accountCleanup(dario);
    expect(await commerceRowsOf(dario.accountId)).toBe('0');
    const store = await db.execute<{ status: string }>(
      sql`select status from establishments.establishments where id = ${storeId}`,
    );
    expect(store.rows[0]?.status).toBe('retirada');
  });
});
