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
import { seedReferencePrices } from '../support/reference-prices';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c0777777-7777-4777-8777-777777777777';
const riceId = 'c0777777-7777-4777-8777-aaaaaaaaaaaa';
// Sin precios de referencia: un precio oficial suyo queda en revisión (ADR-037).
const oilId = 'c0777777-7777-4777-8777-cccccccccccc';
const STORE = { lat: 4.5339, lng: -75.6811 };
const claimBody = {
  establishmentId: storeId,
  responsibleName: 'Rosa Gómez',
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
};

// #201: las respuestas reales del registro de un comercio cumplen el contrato, en modo estricto.
describe('registro de un comercio frente a docs/openapi.yaml (#201)', () => {
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
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, commerce.merchant_claim_rejections, shared.outbox, shared.processed_events, establishments.establishments, establishments.store_proposals, commerce.official_prices, commerce.official_price_reviews, reliability.official_reviews, comparison.price_current, catalog.presentations, catalog.products, catalog.product_aliases`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
    await app.get(ImportCatalog).save({
      id: 'c0777777-7777-4777-8777-bbbbbbbbbbbb',
      name: 'Arroz del contrato comercial',
      brand: 'Marca de prueba',
      categoryCode: 'grains-groceries',
      aliases: [],
      presentations: [
        { id: riceId, quantity: 500, unit: 'g', packCount: 1, barcode: '7702511777014' },
        { id: oilId, quantity: 1000, unit: 'g', packCount: 1, barcode: '7707211777016' },
      ],
    });
    // ADR-037: el arroz tiene tres tiendas de referencia; el aceite, ninguna.
    await seedReferencePrices(app, {
      idPrefix: 'c0777778',
      presentationIds: [riceId],
      priceCop: 2600,
      near: STORE,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const claim = (as: SignedIn | null, body: object = claimBody) => {
    const call = request(server).post('/v1/commerce/claims').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const me = (as: SignedIn) => request(server).get('/v1/commerce/me').set('Cookie', as.cookie);

  it('POST /commerce/claims y GET /commerce/me responden como dice el contrato', async () => {
    const rosa = await signIn(server, db, 'contrato-comercio@correo.com');
    const other = await signIn(server, db, 'contrato-otra@correo.com');
    const unverified = await signIn(
      server,
      db,
      'contrato-sin-verificar@correo.com',
      'reportante',
      'Persona',
      false,
    );

    const responses = [
      ['GET /commerce/me', 404, await me(rosa)],
      ['POST /commerce/claims', 400, await claim(rosa, { ...claimBody, nit: '800.197.268-5' })],
      [
        'POST /commerce/claims',
        422,
        await claim(rosa, { ...claimBody, location: { lat: 4.5349, lng: -75.6811 } }),
      ],
      ['POST /commerce/claims', 401, await claim(null)],
      ['POST /commerce/claims', 403, await claim(unverified)],
      [
        'POST /commerce/claims',
        404,
        await claim(rosa, {
          ...claimBody,
          establishmentId: 'c0888888-8888-4888-8888-888888888888',
        }),
      ],
      ['POST /commerce/claims', 201, await claim(rosa)],
      ['POST /commerce/claims', 409, await claim(other)],
      ['GET /commerce/me', 200, await me(rosa)],
    ] as const;

    const eligibility = `/v1/establishments/${storeId}/merchant-reports`;
    const own = await request(server).get(eligibility).set('Cookie', rosa.cookie).expect(200);
    const foreign = await request(server).get(eligibility).set('Cookie', other.cookie).expect(200);
    await request(server).get(eligibility).expect(401);
    expect(own.body).toEqual({ canReport: false });
    // `other` ya intentó registrar la tienda y quedó una disputa abierta suya (el POST también la rechazaría).
    expect(foreign.body).toEqual({ canReport: false, alreadyReported: true });
    expect(foreign.headers['cache-control']).toBe('private, no-store');
    expect(
      contractErrors(
        'GET /establishments/:establishmentId/merchant-reports',
        200,
        foreign.body as unknown,
      ),
    ).toEqual([]);

    expect(responses.map(([, status, response]) => [status, response.status])).toEqual(
      responses.map(([, status]) => [status, status]),
    );
    expect(
      responses.flatMap(([route, status, response]) =>
        contractErrors(route, status, response.body as unknown),
      ),
    ).toEqual([]);
  });

  it('la tienda que no está en el mapa: pre-aprobado y, al rechazarse, rechazado (#202)', async () => {
    const luis = await signIn(server, db, 'contrato-nueva@correo.com');
    const moderator = await signIn(server, db, 'contrato-moderadora@correo.com', 'moderador');
    const newStore = {
      ...claimBody,
      establishmentId: undefined,
      newEstablishment: { name: 'Tienda El Paraíso', type: 'barrio', municipality: 'cordoba' },
    };

    const created = await claim(luis, newStore);
    const preApproved = await me(luis);
    const { establishmentId } = created.body as { establishmentId: string };
    // H5: la propuesta que nace del reclamo trae al responsable y avisa que concede el rol.
    const proposals = await request(server)
      .get('/v1/moderation/store-proposals')
      .set('Cookie', moderator.cookie);
    expect(proposals.body).toMatchObject({
      items: [{ id: establishmentId, claim: { grantsMerchantRole: true } }],
    });
    await request(server)
      .post(`/v1/moderation/store-proposals/${establishmentId}/decision`)
      .set('Cookie', moderator.cookie)
      .set('X-CSRF-Token', moderator.csrfToken)
      .send({ decision: 'rechazar', note: 'No encontramos la tienda' })
      .expect(204);
    await app.get(OutboxRelay).runOnce();
    const rejected = await me(luis);

    const responses = [
      ['POST /commerce/claims', 201, created],
      ['GET /commerce/me', 200, preApproved],
      ['GET /commerce/me', 200, rejected],
      ['GET /moderation/store-proposals', 200, proposals],
    ] as const;
    expect(responses.map(([, , response]) => response.status)).toEqual([201, 200, 200, 200]);
    expect((rejected.body as { status: string }).status).toBe('rechazado');
    expect(
      responses.flatMap(([route, status, response]) =>
        contractErrors(route, status, response.body as unknown),
      ),
    ).toEqual([]);
  });

  it('los precios oficiales responden como dice el contrato (#203)', async () => {
    const owner = await signIn(server, db, 'contrato-oficiales@correo.com');
    await db.execute(sql`truncate commerce.merchant_claims, establishments.store_proposals`);
    await claim(owner).expect(201);
    await app.get(OutboxRelay).runOnce();
    const send = (method: 'put' | 'post', path: string, body?: object) => {
      const call = request(server)
        [method](`/v1${path}`)
        .set('Cookie', owner.cookie)
        .set('X-CSRF-Token', owner.csrfToken);
      return body === undefined ? call : call.send(body);
    };
    // D7 (#205): el archivo, con el encabezado salvo que se pida otra primera fila.
    const bulk = (rows: string[], header = 'codigo_barras;precio') =>
      request(server)
        .post('/v1/commerce/prices/bulk')
        .set('Content-Type', 'text/csv')
        .set('Cookie', owner.cookie)
        .set('X-CSRF-Token', owner.csrfToken)
        .send([header, ...rows].join('\n'));

    const responses = [
      [
        'PUT /commerce/prices',
        200,
        await send('put', '/commerce/prices', { presentationId: riceId, priceCop: 2600 }),
      ],
      [
        'PUT /commerce/prices',
        422,
        await send('put', '/commerce/prices', { presentationId: riceId, priceCop: 50 }),
      ],
      // ADR-037 (H19): claramente fuera de rango se rechaza; sin referencia queda en revisión.
      [
        'PUT /commerce/prices',
        422,
        await send('put', '/commerce/prices', { presentationId: riceId, priceCop: 52_000 }),
      ],
      [
        'PUT /commerce/prices',
        200,
        await send('put', '/commerce/prices', { presentationId: oilId, priceCop: 8900 }),
      ],
      [
        'PUT /commerce/prices',
        400,
        await send('put', '/commerce/prices', { presentationId: riceId }),
      ],
      [
        'GET /commerce/prices',
        200,
        await request(server).get('/v1/commerce/prices').set('Cookie', owner.cookie),
      ],
      ['POST /commerce/prices/reconfirm', 200, await send('post', '/commerce/prices/reconfirm')],
      [
        'POST /commerce/prices/bulk',
        200,
        await bulk(['7702511777014;300', '1;2600', '7707211777016;8900']),
      ],
      ['POST /commerce/prices/bulk', 400, await bulk([], '7702511777014;2600')],
      [
        'POST /commerce/prices/bulk',
        413,
        await bulk(Array.from({ length: 1001 }, (_, i) => `${String(i)};2600`)),
      ],
      [
        'POST /commerce/prices/reconfirm',
        401,
        await request(server).post('/v1/commerce/prices/reconfirm'),
      ],
    ] as const;

    expect(responses.map(([, status, response]) => [status, response.status])).toEqual(
      responses.map(([, status]) => [status, status]),
    );
    expect(
      responses.flatMap(([route, status, response]) =>
        contractErrors(route, status, response.body as unknown),
      ),
    ).toEqual([]);
  });

  it('dejar y eliminar la tienda responden como dice el contrato (ADR-040)', async () => {
    const owner = await signIn(server, db, 'contrato-salida@correo.com');
    const moderator = await signIn(
      server,
      db,
      'contrato-moderadora-salida@correo.com',
      'moderador',
    );
    await db.execute(sql`truncate commerce.merchant_claims, establishments.store_proposals`);
    await claim(owner).expect(201);
    await app.get(OutboxRelay).runOnce();
    const send = (as: SignedIn, method: 'post' | 'delete', path: string) =>
      request(server)
        [method](`/v1${path}`)
        .set('Cookie', as.cookie)
        .set('X-CSRF-Token', as.csrfToken);

    const responses = [
      // La tienda del catálogo no la creó la cuenta.
      [
        'DELETE /commerce/establishment',
        403,
        await send(owner, 'delete', '/commerce/establishment'),
      ],
      ['POST /commerce/me/leave', 200, await send(owner, 'post', '/commerce/me/leave')],
      ['POST /commerce/me/leave', 200, await send(owner, 'post', '/commerce/me/leave')],
      [
        'DELETE /commerce/establishment',
        404,
        await send(owner, 'delete', '/commerce/establishment'),
      ],
      ['POST /commerce/me/leave', 401, await request(server).post('/v1/commerce/me/leave')],
      [
        'DELETE /commerce/establishment',
        401,
        await request(server).delete('/v1/commerce/establishment'),
      ],
      ['POST /commerce/me/leave', 403, await send(moderator, 'post', '/commerce/me/leave')],
    ] as const;

    expect(responses.map(([, status, response]) => [status, response.status])).toEqual(
      responses.map(([, status]) => [status, status]),
    );
    expect(
      responses.flatMap(([route, status, response]) =>
        contractErrors(route, status, response.body as unknown),
      ),
    ).toEqual([]);
  });
});
