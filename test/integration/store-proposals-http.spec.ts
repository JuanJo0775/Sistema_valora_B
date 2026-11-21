import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { ReporterIdentity } from '../../src/modules/identity';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Tienda de prueba: solo existe dentro de esta prueba.
const existingId = 'f0222222-2222-4222-8222-111111111111';
const proposalBody = {
  name: 'Tienda Esperanza',
  type: 'barrio',
  lat: 4.5339,
  lng: -75.6811,
  municipality: 'armenia',
};
const note = 'Tienda verificada en el sitio';

describe('propuestas de tiendas por HTTP (RF-005, #27)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let reporter: SignedIn;
  let moderator: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.external_identities, identity.email_verifications, identity.sessions, identity.accounts`,
    );
    reporter = await signIn(server, db, 'propone@correo.com');
    moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate establishments.establishments, establishments.store_proposals`);
    // Unos 30 m al norte del punto propuesto.
    await app.get(ImportEstablishments).save({
      id: existingId,
      name: 'Tienda La Esperanza',
      type: 'barrio',
      lat: 4.53417,
      lng: -75.6811,
    });
  });

  const post = (as: SignedIn | null, path: string, body: object) => {
    const call = request(server).post(path).send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const propose = (as: SignedIn | null = reporter, body: object = proposalBody) =>
    post(as, '/v1/establishment-proposals', body);
  const nearbyIds = async () => {
    const response = await request(server)
      .get('/v1/establishments/nearby')
      .query({ lat: '4.5339', lng: '-75.6811' })
      .expect(200);
    return (response.body as { items: { id: string }[] }).items.map((item) => item.id);
  };

  describe('POST /v1/establishment-proposals', () => {
    it('202: queda pendiente y no aparece en el mapa', async () => {
      const response = await propose().expect(202);

      expect(response.body).toEqual({ id: expect.any(String) as unknown, status: 'pendiente' });
      expect(await nearbyIds()).toEqual([existingId]);
    });

    it('400 con datos inválidos; 401 sin sesión; 403 un moderador o sin CSRF', async () => {
      const withoutCsrf = request(server)
        .post('/v1/establishment-proposals')
        .set('Cookie', reporter.cookie)
        .send(proposalBody);

      const responses = await Promise.all([
        propose(reporter, { ...proposalBody, type: 'tienda' }),
        propose(reporter, { ...proposalBody, lat: 95 }),
        propose(reporter, { ...proposalBody, name: '' }),
        // Grill de la #106: solo municipios del Quindío.
        propose(reporter, { ...proposalBody, municipality: 'pereira' }),
        propose(null),
        propose(moderator),
        withoutCsrf,
      ]);

      expect(responses.map((response) => response.status)).toEqual([
        400, 400, 400, 400, 401, 403, 403,
      ]);
    });
  });

  describe('moderación de propuestas', () => {
    const queue = (as: SignedIn = moderator) =>
      request(server).get('/v1/moderation/store-proposals').set('Cookie', as.cookie);
    const decide = (id: string, body: object, as: SignedIn = moderator) =>
      post(as, `/v1/moderation/store-proposals/${id}/decision`, body);

    it('el moderador ve la propuesta con su posible duplicado, sin datos de quien la propuso', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };

      const response = await queue().expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        items: [
          {
            id,
            name: 'Tienda Esperanza',
            type: 'barrio',
            lat: 4.5339,
            lng: -75.6811,
            municipality: 'armenia',
            outOfZone: false,
            possibleDuplicates: [
              {
                id: existingId,
                name: 'Tienda La Esperanza',
                distanceM: expect.closeTo(30, -1) as unknown,
              },
            ],
            createdAt: expect.any(String) as unknown,
          },
        ],
      });
      const { reporterKey } = await app.get(ReporterIdentity).of(reporter.accountId);
      expect(JSON.stringify(response.body)).not.toContain(reporterKey);
    });

    it('aprobarla la pone en el mapa y la saca de la lista', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };

      await decide(id, { decision: 'aprobar', note }).expect(204);

      expect((await nearbyIds()).sort()).toEqual([existingId, id].sort());
      expect((await queue().expect(200)).body).toEqual({ items: [] });
    });

    it('fusionar con una tienda que no existe responde 422; con una que existe, 204 y no crea nada', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };

      const unknown = await decide(id, {
        decision: 'fusionar',
        mergeInto: 'f0222222-2222-4222-8222-999999999999',
        note,
      }).expect(422);
      await decide(id, { decision: 'fusionar', mergeInto: existingId, note }).expect(204);

      expect(unknown.body).toMatchObject({ code: 'UNKNOWN_ESTABLISHMENT' });
      expect(await nearbyIds()).toEqual([existingId]);
    });

    it('400 sin motivo; 404 ya decidida o inexistente; 403 un reportante', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };
      await decide(id, { decision: 'rechazar', note }).expect(204);

      const responses = await Promise.all([
        decide(id, { decision: 'aprobar', note: 'corto' }),
        decide(id, { decision: 'aprobar', note }),
        decide('f0333333-3333-4333-8333-999999999999', { decision: 'aprobar', note }),
        decide(id, { decision: 'aprobar', note }, reporter),
        queue(reporter),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 404, 404, 403, 403]);
    });
  });
});
