import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Productos y tiendas de prueba: solo existen dentro de esta prueba.
const rice = 'fc111111-1111-4111-8111-111111111111';
const rice500g = 'fc111111-1111-4111-8111-aaaaaaaaaaa1';
const rice1kg = 'fc111111-1111-4111-8111-aaaaaaaaaaa2';
const milk1l = 'fc111111-1111-4111-8111-bbbbbbbbbbb1';
const donJose = 'fc222222-2222-4222-8222-000000000001';
const ara = 'fc222222-2222-4222-8222-000000000002';
// Punto de consulta en el centro de Armenia; las tiendas de prueba están unos 120 m al norte.
const userLocation = { lat: '4.5339', lng: '-75.6811' };

const countsOf = (items: { id: string; priceCount: number }[]) =>
  Object.fromEntries(items.map(({ id, priceCount }) => [id, priceCount]));

describe('las listas de tiendas dicen cuántos precios vigentes tiene cada una (B#131)', () => {
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
      sql`truncate comparison.price_current, catalog.presentations, catalog.products, establishments.establishments`,
    );
    const catalog = app.get(ImportCatalog);
    await catalog.save({
      id: rice,
      name: 'Arroz',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: rice500g, quantity: 500, unit: 'g', packCount: 1 },
        { id: rice1kg, quantity: 1, unit: 'kg', packCount: 1 },
      ],
    });
    await catalog.save({
      id: 'fc111111-1111-4111-8111-222222222222',
      name: 'Leche entera',
      categoryCode: 'dairy-eggs',
      presentations: [{ id: milk1l, quantity: 1, unit: 'l', packCount: 1 }],
    });
    const stores = app.get(ImportEstablishments);
    const shop = (id: string, name: string) =>
      stores.save({ id, name, type: 'barrio', lat: 4.535, lng: -75.6811, municipality: 'armenia' });
    await shop(donJose, 'Tienda Don José');
    await shop(ara, 'Ara Centro');
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
    const price = (
      presentationId: string,
      establishmentId: string,
      observedAt = hoursAgo(1),
      status: 'vigente' | 'en_revision' = 'vigente',
    ) => ({
      presentationId,
      establishmentId,
      reportId: crypto.randomUUID(),
      priceCop: 2500,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
      status,
    });
    await db.insert(priceCurrent).values([
      price(rice500g, donJose),
      price(rice1kg, donJose),
      price(milk1l, donJose),
      // Un precio en revisión y otro de hace 60 días no cuentan (como onlyCurrent).
      price(rice500g, ara, hoursAgo(1), 'en_revision'),
      price(milk1l, ara, hoursAgo(60 * 24)),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/establishments trae priceCount en cada tienda y conserva su caché', async () => {
    const response = await request(server)
      .get('/v1/establishments')
      .query({ municipality: 'armenia' })
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(
      countsOf((response.body as { items: { id: string; priceCount: number }[] }).items),
    ).toEqual({ [donJose]: 3, [ara]: 0 });
  });

  it('GET /v1/establishments/nearby trae priceCount en cada tienda y sigue sin caché', async () => {
    const response = await request(server)
      .get('/v1/establishments/nearby')
      .query(userLocation)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(
      countsOf((response.body as { items: { id: string; priceCount: number }[] }).items),
    ).toEqual({ [donJose]: 3, [ara]: 0 });
  });
});
