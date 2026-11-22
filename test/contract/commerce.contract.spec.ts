import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c0777777-7777-4777-8777-777777777777';
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
      sql`truncate identity.email_verifications, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, establishments.establishments`,
    );
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      ...STORE,
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
