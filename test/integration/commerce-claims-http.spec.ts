import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
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
      sql`truncate identity.email_verifications, identity.sessions, identity.role_changes, identity.accounts`,
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
      sql`truncate identity.role_changes, commerce.merchant_claims, shared.outbox, shared.processed_events, establishments.establishments, establishments.store_proposals, commerce.merchant_claim_rejections`,
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
});
