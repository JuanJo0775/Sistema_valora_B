import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Producto de prueba: solo existe dentro de esta prueba.
const riceId = 'fa222222-2222-4222-8222-111111111111';
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
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
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
});
