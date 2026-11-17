import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportInitialPrices } from '../../src/modules/comparison';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const productId = 'b1111111-1111-4111-8111-111111111111';
const presentationId = 'b1111111-1111-4111-8111-aaaaaaaaaaaa';
const d1 = 'b2222222-2222-4222-8222-111111111111';
const other = 'b2222222-2222-4222-8222-222222222222';

// B#135: un «Dato inicial» de la página de una cadena.
const initial = (establishmentId: string, priceCop = 1990) => ({
  id: establishmentId.replace('b2222222', 'b3333333'),
  presentationId,
  establishmentId,
  priceCop,
  observedAt: new Date(Date.now() - 60 * 60 * 1000),
  sourceUrl: 'https://www.d1.com.co/arroz-diana-500g-12002073/p',
});

describe('precios iniciales de la semilla en la comparación (B#135)', () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate comparison.price_current, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    for (const id of [d1, other]) {
      await app.get(ImportEstablishments).save({
        id,
        name: id === d1 ? 'D1' : 'Tienda de prueba',
        type: 'descuento',
        lat: 4.535,
        lng: -75.6811,
      });
    }
  });

  const compare = () =>
    request(server)
      .get(`/v1/products/${productId}/comparison`)
      .query({ municipality: 'armenia' })
      .expect(200);

  it('se ve como «siembra», con confiabilidad baja y sin confirmaciones', async () => {
    await app.get(ImportInitialPrices).execute([initial(d1)]);

    const response = await compare();

    expect((response.body as { results: unknown[] }).results).toEqual([
      expect.objectContaining({
        reportId: initial(d1).id,
        priceCop: 1990,
        source: 'siembra',
        reliability: 'baja',
        confirmations: 0,
      }),
    ]);
  });

  it('nunca reemplaza un precio que vio la comunidad', async () => {
    const seenAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: other,
      reportId: 'b4444444-4444-4444-8444-444444444444',
      priceCop: 2500,
      priceType: 'normal',
      observedAt: seenAt,
      receivedAt: seenAt,
    });

    await app.get(ImportInitialPrices).execute([initial(other)]);

    const response = await compare();
    expect((response.body as { results: unknown[] }).results).toEqual([
      expect.objectContaining({ priceCop: 2500, source: 'comunidad' }),
    ]);
  });

  it('repetir la semilla no duplica', async () => {
    await app.get(ImportInitialPrices).execute([initial(d1)]);
    await app.get(ImportInitialPrices).execute([initial(d1, 2090)]);

    const rows = await db.select().from(priceCurrent);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priceCop).toBe(2090);
  });
});
