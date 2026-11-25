import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Tienda de prueba: solo existe dentro de esta prueba.
const storeId = 'c0555555-5555-4555-8555-555555555555';
const STORE = { lat: 4.5339, lng: -75.6811 };
const claimBody = {
  establishmentId: storeId,
  responsibleName: 'Rosa Gómez',
  nit: '800.197.268-4',
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  // A unos 20 m de la tienda.
  location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
};

describe('registro de un comercio por HTTP (RF-015, #201)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  // Pocas cuentas, creadas una vez: el registro tiene un límite por minuto (#16).
  let rosa: SignedIn;
  let ana: SignedIn;
  let pedro: SignedIn;
  let unverified: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts`,
    );
    rosa = await signIn(server, db, 'rosa@correo.com');
    ana = await signIn(server, db, 'ana@correo.com');
    pedro = await signIn(server, db, 'pedro@correo.com');
    unverified = await signIn(server, db, 'sin-verificar@correo.com', 'reportante', 'Sin', false);
    moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate identity.role_changes, commerce.merchant_claims, shared.outbox, shared.processed_events, establishments.establishments, establishments.store_proposals, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.dispute_challengers`,
    );
    // Cada prueba empieza con los reportantes sin tienda.
    await db.execute(sql`update identity.accounts set role = 'reportante' where role = 'comercio'`);
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
  });

  const claim = (as: SignedIn | null, body: object = claimBody) => {
    const call = request(server).post('/v1/commerce/claims').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const me = (as: SignedIn) => request(server).get('/v1/commerce/me').set('Cookie', as.cookie);

  it('201: en la tienda queda verificado, su rol pasa a comercio por el evento y ve su perfil', async () => {
    const response = await claim(rosa).expect(201);

    expect(response.body).toEqual({ status: 'verificado', establishmentId: storeId });
    // identity cambia el rol al recibir MerchantVerified del outbox (ADR-015).
    await app.get(OutboxRelay).runOnce();
    const session = await request(server).get('/v1/auth/session').set('Cookie', rosa.cookie);
    expect((session.body as { role: string }).role).toBe('comercio');
    const profile = await me(rosa).expect(200).expect('Cache-Control', 'private, no-store');
    expect(profile.body).toEqual({
      status: 'verificado',
      establishment: { id: storeId, name: 'Tienda La Esperanza' },
      responsibleName: 'Rosa Gómez',
      informal: false,
      verifiedAt: expect.any(String) as unknown,
      canDeleteEstablishment: false,
    });
  });

  it('422 lejos de la tienda; 409 si la tienda ya tiene dueño; 404 si no existe', async () => {
    await claim(ana).expect(201);

    const farAway = await claim(rosa, { ...claimBody, location: { lat: 4.5349, lng: -75.6811 } });
    const taken = await claim(pedro);
    const missing = await claim(rosa, {
      ...claimBody,
      establishmentId: 'c0666666-6666-4666-8666-666666666666',
    });

    expect([farAway.status, farAway.body]).toEqual([
      422,
      { code: 'NOT_AT_ESTABLISHMENT', message: expect.any(String) as unknown },
    ]);
    expect([taken.status, (taken.body as { code: string }).code]).toEqual([
      409,
      'ESTABLISHMENT_HAS_OWNER',
    ]);
    expect(missing.status).toBe(404);
  });

  it('400 con datos inválidos o un NIT mal escrito; 401 sin sesión; 403 sin correo verificado o sin ser reportante', async () => {
    const responses = await Promise.all([
      claim(rosa, { ...claimBody, nit: '800.197.268-5' }),
      claim(rosa, { ...claimBody, phone: '12345' }),
      claim(rosa, { ...claimBody, acceptedTermsVersion: '2020-01' }),
      claim(rosa, { ...claimBody, location: { lat: 95, lng: 0 } }),
      claim(null),
      claim(unverified),
      claim(moderator),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400, 401, 403, 403,
    ]);
    expect((responses[5].body as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('GET /commerce/me: 404 para una cuenta sin tienda', async () => {
    const response = await me(rosa);

    expect(response.status).toBe(404);
  });

  describe('tienda que no está en el mapa (D2, #202)', () => {
    const HERE = { lat: 4.4613, lng: -75.6674 };
    const newStoreBody = {
      newEstablishment: { name: 'Tienda El Paraíso', type: 'barrio', municipality: 'cordoba' },
      responsibleName: 'Luis Ramírez',
      phone: '3157654321',
      acceptedTermsVersion: '2026-11',
      location: HERE,
    };
    const decide = (as: SignedIn, proposalId: string, decision: string) =>
      request(server)
        .post(`/v1/moderation/store-proposals/${proposalId}/decision`)
        .set('Cookie', as.cookie)
        .set('X-CSRF-Token', as.csrfToken)
        .send({ decision, note: 'Revisada por el moderador' });
    const roleOf = async (as: SignedIn) =>
      (
        (await request(server).get('/v1/auth/session').set('Cookie', as.cookie)).body as {
          role: string;
        }
      ).role;
    // StoreProposalDecided llega a commerce y su MerchantVerified llega a identity.
    const deliverEvents = async () => {
      await app.get(OutboxRelay).runOnce();
      await app.get(OutboxRelay).runOnce();
    };

    it('201 pre-aprobado; al aprobarse la tienda queda verificado y es comercio', async () => {
      const luis = rosa;

      const response = await claim(luis, newStoreBody).expect(201);

      const { establishmentId } = response.body as { establishmentId: string };
      expect(response.body).toEqual({
        status: 'pre_aprobado',
        establishmentId,
        unlocks: [
          'precios_oficiales',
          'carga_por_archivo',
          'promociones',
          'avisos_de_precio',
          'datos_de_la_tienda',
        ],
      });
      expect((await me(luis).expect(200)).body).toMatchObject({
        status: 'pre_aprobado',
        establishment: { id: establishmentId, name: 'Tienda El Paraíso' },
      });
      expect(await roleOf(luis)).toBe('reportante');

      await decide(moderator, establishmentId, 'aprobar').expect(204);
      await deliverEvents();

      expect(await roleOf(luis)).toBe('comercio');
      expect((await me(luis).expect(200)).body).toMatchObject({
        status: 'verificado',
        establishment: { id: establishmentId, name: 'Tienda El Paraíso' },
      });
    });

    // H5: el moderador sabe que aprobar esta tienda verifica a una cuenta, y a quién.
    it('la cola de tiendas trae al responsable solo en la propuesta que nace de un reclamo (H5)', async () => {
      const { establishmentId } = (await claim(rosa, newStoreBody).expect(201)).body as {
        establishmentId: string;
      };
      const plain = await request(server)
        .post('/v1/establishment-proposals')
        .set('Cookie', ana.cookie)
        .set('X-CSRF-Token', ana.csrfToken)
        .send({ name: 'Granero La Vecina', type: 'barrio', municipality: 'cordoba', ...HERE })
        .expect(202);

      const queue = await request(server)
        .get('/v1/moderation/store-proposals')
        .set('Cookie', moderator.cookie)
        .expect(200);

      const items = (queue.body as { items: { id: string; claim?: object }[] }).items;
      expect(items.find((item) => item.id === establishmentId)?.claim).toEqual({
        responsibleName: 'Luis Ramírez',
        phone: '3157654321',
        grantsMerchantRole: true,
      });
      expect(
        items.find((item) => item.id === (plain.body as { id: string }).id),
      ).not.toHaveProperty('claim');
      expect(contractErrors('GET /moderation/store-proposals', 200, queue.body as unknown)).toEqual(
        [],
      );
      // EC-08: ni la cuenta, ni el correo, ni la clave seudónima.
      const secrets = await db.execute<{ secret: string }>(
        sql`select id::text as secret from identity.accounts
            union select email from identity.accounts
            union select reporter_key from identity.accounts where reporter_key is not null
            union select proposer_key from establishments.store_proposals`,
      );
      expect(secrets.rows.length).toBeGreaterThan(2);
      const text = JSON.stringify(queue.body);
      for (const { secret } of secrets.rows) expect(text).not.toContain(secret);
    });

    it('al rechazarse la tienda ve el motivo y puede registrar otra', async () => {
      const luis = rosa;
      const { establishmentId } = (await claim(luis, newStoreBody).expect(201)).body as {
        establishmentId: string;
      };

      await decide(moderator, establishmentId, 'rechazar').expect(204);
      await deliverEvents();

      expect((await me(luis).expect(200)).body).toEqual({
        status: 'rechazado',
        reason: 'Revisada por el moderador',
        rejectedAt: expect.any(String) as unknown,
      });
      expect(await roleOf(luis)).toBe('reportante');
      await claim(luis).expect(201);
    });

    it('422 CHAIN_STORE_NOT_CLAIMABLE si la tienda nueva es de cadena (H11); no deja propuesta ni solicitud', async () => {
      for (const [name, type] of [
        ['D1', 'barrio'],
        ['Éxito Express', 'minimercado'],
        ['Tienda cualquiera', 'descuento'],
      ]) {
        const response = await claim(rosa, {
          ...newStoreBody,
          newEstablishment: { ...newStoreBody.newEstablishment, name, type },
        });

        expect([response.status, (response.body as { code: string }).code]).toEqual([
          422,
          'CHAIN_STORE_NOT_CLAIMABLE',
        ]);
      }
      await me(rosa).expect(404);
      const proposals = await db.execute(sql`select 1 from establishments.store_proposals`);
      expect(proposals.rows).toEqual([]);
    });

    it('«Panadería D10» no es cadena: la tienda nueva queda pre_aprobado', async () => {
      const response = await claim(rosa, {
        ...newStoreBody,
        newEstablishment: { ...newStoreBody.newEstablishment, name: 'Panadería D10' },
      });

      expect([response.status, (response.body as { status: string }).status]).toEqual([
        201,
        'pre_aprobado',
      ]);
    });

    it('400 sin tienda o con las dos formas a la vez', async () => {
      const luis = rosa;
      const { newEstablishment, ...withoutStore } = newStoreBody;

      const responses = await Promise.all([
        claim(luis, withoutStore),
        claim(luis, { ...newStoreBody, establishmentId: storeId }),
        claim(luis, {
          ...newStoreBody,
          newEstablishment: { ...newEstablishment, municipality: 'pereira' },
        }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    });
  });

  // H11 (ADR-037): tiendas de cadena y supermercados.
  describe('tiendas de cadena y supermercados (H11, ADR-037)', () => {
    const chainId = 'c0777777-7777-4777-8777-777777777777';
    const marketId = 'c0888888-8888-4888-8888-888888888888';
    const claimOn = (establishmentId: string, body: object = {}) => ({
      ...claimBody,
      establishmentId,
      ...body,
    });
    const roleOf = async (as: SignedIn) =>
      (
        (await request(server).get('/v1/auth/session').set('Cookie', as.cookie)).body as {
          role: string;
        }
      ).role;
    const decide = (caseId: string, decision: string) =>
      request(server)
        .post(`/v1/moderation/merchant-cases/${caseId}/decision`)
        .set('Cookie', moderator.cookie)
        .set('X-CSRF-Token', moderator.csrfToken)
        .send({ decision, note: 'Revisado por la persona moderadora' });
    const queue = async () =>
      (
        (
          await request(server)
            .get('/v1/moderation/merchant-cases')
            .set('Cookie', moderator.cookie)
            .expect(200)
        ).body as { items: { id: string; kind: string; owner: { status: string } | null }[] }
      ).items;

    beforeEach(async () => {
      const stores = app.get(ImportEstablishments);
      await stores.save({ id: chainId, name: 'D1 Avenida 19', type: 'descuento', ...STORE });
      await stores.save({
        id: marketId,
        name: 'Supermercado Laureles',
        type: 'supermercado',
        ...STORE,
      });
    });

    it('422 CHAIN_STORE_NOT_CLAIMABLE en una tienda de cadena, también lejos de ella; no hay rol, ni solicitud, ni caso', async () => {
      const near = await claim(rosa, claimOn(chainId));
      const far = await claim(rosa, claimOn(chainId, { location: { lat: 4.6, lng: -75.6 } }));

      for (const response of [near, far]) {
        expect([response.status, response.body]).toEqual([
          422,
          { code: 'CHAIN_STORE_NOT_CLAIMABLE', message: expect.any(String) as unknown },
        ]);
      }
      expect(contractErrors('POST /commerce/claims', 422, near.body as unknown)).toEqual([]);
      await me(rosa).expect(404);
      expect(await queue()).toEqual([]);
    });

    it('la cadena se rechaza aunque ya tenga dueño: no abre disputa', async () => {
      await db.execute(
        sql`insert into commerce.merchant_claims (account_id, establishment_id, responsible_name, informal, phone, accepted_terms_version, status, verified_at) values (${ana.accountId}, ${chainId}, 'Dueño anterior', true, '3001234567', '2026-11', 'verificado', now())`,
      );

      await claim(rosa, claimOn(chainId)).expect(422);

      expect(await queue()).toEqual([]);
    });

    it('401 sin sesión y 403 sin correo verificado van antes que la regla de cadena', async () => {
      const responses = await Promise.all([
        claim(null, claimOn(chainId)),
        claim(unverified, claimOn(chainId)),
      ]);

      expect(responses.map((response) => response.status)).toEqual([401, 403]);
    });

    it('un supermercado que no es cadena queda pre_aprobado, sin rol, con un caso de reclamo', async () => {
      const response = await claim(rosa, claimOn(marketId)).expect(201);

      expect(response.body).toEqual({
        status: 'pre_aprobado',
        establishmentId: marketId,
        unlocks: expect.arrayContaining(['precios_oficiales']) as unknown,
      });
      expect(contractErrors('POST /commerce/claims', 201, response.body as unknown)).toEqual([]);
      await app.get(OutboxRelay).runOnce();
      expect(await roleOf(rosa)).toBe('reportante');
      const profile = await me(rosa).expect(200);
      expect(profile.body).toMatchObject({
        status: 'pre_aprobado',
        establishment: { id: marketId, name: 'Supermercado Laureles' },
        verifiedAt: null,
      });
      expect(contractErrors('GET /commerce/me', 200, profile.body as unknown)).toEqual([]);
      const items = await queue();
      expect(items).toEqual([
        expect.objectContaining({
          kind: 'reclamo',
          owner: expect.objectContaining({ status: 'pre_aprobado' }) as unknown,
        }),
      ]);
      expect(JSON.stringify(items)).not.toContain(rosa.accountId);
    });

    it('lejos de un supermercado sigue el 422 NOT_AT_ESTABLISHMENT', async () => {
      const far = await claim(
        rosa,
        claimOn(marketId, { location: { lat: 4.5349, lng: -75.6811 } }),
      );

      expect([far.status, (far.body as { code: string }).code]).toEqual([
        422,
        'NOT_AT_ESTABLISHMENT',
      ]);
      expect(await queue()).toEqual([]);
    });

    it('otra cuenta que reclama el supermercado pre-aprobado abre la disputa de siempre (409)', async () => {
      await claim(rosa, claimOn(marketId)).expect(201);

      const second = await claim(pedro, claimOn(marketId)).expect(409);

      expect((second.body as { code: string }).code).toBe('ESTABLISHMENT_HAS_OWNER');
      expect((await queue()).map((item) => item.kind).sort()).toEqual(['disputa', 'reclamo']);
    });

    it('aprobar el reclamo lo verifica y concede el rol de comercio', async () => {
      await claim(rosa, claimOn(marketId)).expect(201);
      const [item] = await queue();

      await decide(item?.id ?? '', 'aprobar').expect(204);
      await app.get(OutboxRelay).runOnce();

      expect(await roleOf(rosa)).toBe('comercio');
      expect((await me(rosa).expect(200)).body).toMatchObject({ status: 'verificado' });
      expect(await queue()).toEqual([]);
      await decide(item?.id ?? '', 'aprobar').expect(404);
    });

    it('rechazar el reclamo cierra la solicitud con el motivo y deja a la cuenta como reportante', async () => {
      await claim(rosa, claimOn(marketId)).expect(201);
      const [item] = await queue();

      await decide(item?.id ?? '', 'rechazar').expect(204);
      await app.get(OutboxRelay).runOnce();

      expect(await roleOf(rosa)).toBe('reportante');
      expect((await me(rosa).expect(200)).body).toEqual({
        status: 'rechazado',
        reason: 'Revisado por la persona moderadora',
        rejectedAt: expect.any(String) as unknown,
      });
      expect(await queue()).toEqual([]);
    });

    it('422 DECISION_NOT_APPLICABLE si la decisión no corresponde al tipo de caso; 400 con una decisión desconocida', async () => {
      await claim(rosa, claimOn(marketId)).expect(201);
      const [item] = await queue();

      const wrong = await decide(item?.id ?? '', 'revocar');
      const unknown = await decide(item?.id ?? '', 'perdonar');

      expect([wrong.status, (wrong.body as { code: string }).code]).toEqual([
        422,
        'DECISION_NOT_APPLICABLE',
      ]);
      expect(unknown.status).toBe(400);
      expect(await queue()).toHaveLength(1);
    });

    it('barrio: sigue verificándose al instante', async () => {
      const response = await claim(rosa).expect(201);

      expect(response.body).toEqual({ status: 'verificado', establishmentId: storeId });
    });
  });
});
