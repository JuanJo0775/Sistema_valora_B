import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
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
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, establishments.establishments`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
    });
  });

  // Cada prueba crea sus cuentas con un correo propio.
  const account = (role = 'reportante', verified = true) => {
    counter += 1;
    return signIn(server, db, `comercio${String(counter)}@correo.com`, role, 'Rosa', verified);
  };
  const claim = (as: SignedIn | null, body: object = claimBody) => {
    const call = request(server).post('/v1/commerce/claims').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const me = (as: SignedIn) => request(server).get('/v1/commerce/me').set('Cookie', as.cookie);

  it('201: en la tienda queda verificado, su rol pasa a comercio y ve su perfil', async () => {
    const rosa = await account();

    const response = await claim(rosa).expect(201);

    expect(response.body).toEqual({ status: 'verificado', establishmentId: storeId });
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
    const [far, owner, second, lost] = await Promise.all([
      account(),
      account(),
      account(),
      account(),
    ]);
    await claim(owner).expect(201);

    const farAway = await claim(far, { ...claimBody, location: { lat: 4.5349, lng: -75.6811 } });
    const taken = await claim(second);
    const missing = await claim(lost, {
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
    const [rosa, unverified, moderator] = await Promise.all([
      account(),
      account('reportante', false),
      account('moderador'),
    ]);

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
    expect((responses[5]?.body as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('GET /commerce/me: 404 para una cuenta sin tienda', async () => {
    await me(await account()).expect(404);
  });
});
