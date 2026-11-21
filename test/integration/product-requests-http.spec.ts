import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ReporterIdentity } from '../../src/modules/identity';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Producto de prueba: solo existe dentro de esta prueba.
const riceId = 'fa222222-2222-4222-8222-111111111111';
const note = 'Producto verificado en la tienda';
const requestBody = {
  name: 'Panela pulverizada',
  brand: 'La Molienda',
  categoryCode: 'grains-groceries',
  quantity: 500,
  unit: 'g',
};

describe('propuestas de productos por HTTP (RF-003, #26)', () => {
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
    reporter = await signIn(server, db, 'propone-producto@correo.com');
    moderator = await signIn(server, db, 'moderador-catalogo@correo.com', 'moderador');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate catalog.product_requests, catalog.presentations, catalog.products, catalog.product_aliases`,
    );
    await app.get(ImportCatalog).save({
      id: riceId,
      name: 'Arroz blanco',
      categoryCode: 'grains-groceries',
      presentations: [
        {
          id: 'fa222222-2222-4222-8222-aaaaaaaaaaaa',
          quantity: 500,
          unit: 'g',
          packCount: 1,
          barcode: '7701234567897',
        },
      ],
    });
  });

  const post = (as: SignedIn | null, path: string, body: object) => {
    const call = request(server).post(path).send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const propose = (as: SignedIn | null = reporter, body: object = requestBody) =>
    post(as, '/v1/product-requests', body);
  const searchIds = async (q: string) => {
    const response = await request(server).get('/v1/products').query({ q }).expect(200);
    return (response.body as { items: { id: string }[] }).items.map((item) => item.id);
  };

  describe('POST /v1/product-requests', () => {
    it('202: queda pendiente y no aparece en la búsqueda', async () => {
      const response = await propose().expect(202);

      expect(response.body).toEqual({ id: expect.any(String) as unknown, status: 'pendiente' });
      expect(await searchIds('panela')).toEqual([]);
    });

    it('409 si el código ya es de un producto, diciendo cuál; 422 con una categoría desconocida', async () => {
      const taken = await propose(reporter, { ...requestBody, barcode: '7701234567897' });
      const unknown = await propose(reporter, { ...requestBody, categoryCode: 'juguetes' });

      expect(taken.status).toBe(409);
      expect(taken.body).toMatchObject({ code: 'BARCODE_TAKEN' });
      expect((taken.body as { message: string }).message).toContain(riceId);
      expect(unknown.status).toBe(422);
      expect(unknown.body).toMatchObject({ code: 'UNKNOWN_CATEGORY' });
    });

    it('400 con datos inválidos; 401 sin sesión; 403 un moderador o sin CSRF', async () => {
      const withoutCsrf = request(server)
        .post('/v1/product-requests')
        .set('Cookie', reporter.cookie)
        .send(requestBody);

      const responses = await Promise.all([
        propose(reporter, { ...requestBody, name: 'P' }),
        propose(reporter, { ...requestBody, unit: 'libra' }),
        propose(reporter, { ...requestBody, quantity: 0 }),
        propose(reporter, { ...requestBody, packCount: 0 }),
        propose(reporter, { ...requestBody, barcode: '7701234567890' }),
        propose(null),
        propose(moderator),
        withoutCsrf,
      ]);

      expect(responses.map((response) => response.status)).toEqual([
        400, 400, 400, 400, 400, 401, 403, 403,
      ]);
    });
  });

  describe('moderación de productos propuestos', () => {
    const queue = (as: SignedIn = moderator) =>
      request(server).get('/v1/moderation/product-requests').set('Cookie', as.cookie);
    const decide = (id: string, body: object, as: SignedIn = moderator) =>
      post(as, `/v1/moderation/product-requests/${id}/decision`, body);
    const proposeRice = async () =>
      (
        (
          await propose(reporter, {
            ...requestBody,
            name: 'Arroz blanco',
            brand: undefined,
          }).expect(202)
        ).body as { id: string }
      ).id;

    it('el moderador ve la propuesta con su posible duplicado, sin datos de quien la propuso', async () => {
      const id = await proposeRice();

      const response = await queue().expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        items: [
          {
            id,
            name: 'Arroz blanco',
            categoryCode: 'grains-groceries',
            quantity: 500,
            unit: 'g',
            packCount: 1,
            possibleDuplicates: [{ id: riceId, name: 'Arroz blanco' }],
            createdAt: expect.any(String) as unknown,
          },
        ],
      });
      const { reporterKey } = await app.get(ReporterIdentity).of(reporter.accountId);
      expect(JSON.stringify(response.body)).not.toContain(reporterKey);
    });

    it('aprobarla la pone en la búsqueda y la saca de la lista', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };

      await decide(id, { decision: 'aprobar', note }).expect(204);

      expect(await searchIds('panela')).toEqual([id]);
      expect((await queue().expect(200)).body).toEqual({ items: [] });
    });

    it('fusionar: 422 con un producto que no existe o con otra base de unidad; 204 deja el nombre como alias', async () => {
      const id = await proposeRice();
      const liters = (
        (await propose(reporter, { ...requestBody, unit: 'l', quantity: 1 }).expect(202)).body as {
          id: string;
        }
      ).id;

      const unknown = await decide(id, {
        decision: 'fusionar',
        mergeInto: 'fa222222-2222-4222-8222-999999999999',
        note,
      }).expect(422);
      const mixed = await decide(liters, { decision: 'fusionar', mergeInto: riceId, note }).expect(
        422,
      );
      await decide(id, { decision: 'fusionar', mergeInto: riceId, note }).expect(204);

      expect(unknown.body).toMatchObject({ code: 'UNKNOWN_PRODUCT' });
      expect(mixed.body).toMatchObject({ code: 'MIXED_UNIT_BASES' });
      expect(await searchIds('arroz')).toEqual([riceId]);
    });

    it('409 si otro producto tomó el código mientras esperaba', async () => {
      const barcode = '7702511000014';
      const first = (
        (await propose(reporter, { ...requestBody, barcode }).expect(202)).body as {
          id: string;
        }
      ).id;
      const second = (
        (await propose(reporter, { ...requestBody, name: 'Panela', barcode }).expect(202)).body as {
          id: string;
        }
      ).id;
      await decide(first, { decision: 'aprobar', note }).expect(204);

      const response = await decide(second, { decision: 'aprobar', note }).expect(409);

      expect(response.body).toMatchObject({ code: 'BARCODE_TAKEN' });
      await decide(second, { decision: 'rechazar', note }).expect(204);
    });

    it('400 sin motivo; 404 ya decidida o inexistente; 403 un reportante', async () => {
      const { id } = (await propose().expect(202)).body as { id: string };
      await decide(id, { decision: 'rechazar', note }).expect(204);

      const responses = await Promise.all([
        decide(id, { decision: 'aprobar', note: 'corto' }),
        decide(id, { decision: 'fusionar', note }),
        decide(id, { decision: 'aprobar', note }),
        decide('fa333333-3333-4333-8333-999999999999', { decision: 'aprobar', note }),
        decide(id, { decision: 'aprobar', note }, reporter),
        queue(reporter),
      ]);

      expect(responses.map((response) => response.status)).toEqual([400, 400, 404, 404, 403, 403]);
    });
  });

  it('GET /v1/products/{productId} trae la imagen con su fuente y su atribución', async () => {
    const image = {
      url: 'https://images.openfoodfacts.org/arroz.jpg',
      source: 'open_food_facts' as const,
      attribution: 'Open Food Facts, CC BY-SA',
    };
    await app.get(ImportCatalog).save({
      id: riceId,
      name: 'Arroz blanco',
      categoryCode: 'grains-groceries',
      image,
      presentations: [
        { id: 'fa222222-2222-4222-8222-aaaaaaaaaaaa', quantity: 500, unit: 'g', packCount: 1 },
      ],
    });

    const response = await request(server).get(`/v1/products/${riceId}`).expect(200);

    expect((response.body as { image: unknown }).image).toEqual(image);
  });
});
