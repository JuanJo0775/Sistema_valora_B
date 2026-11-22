import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { CACHE_PRICES } from '../../src/shared/http/cache-control';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { countAllRows } from '../support/count-rows';

// Productos, presentaciones y tiendas de prueba: solo existen dentro de esta prueba.
const rice = 'fa111111-1111-4111-8111-111111111111';
const rice500g = 'fa111111-1111-4111-8111-aaaaaaaaaaa1';
const rice1kg = 'fa111111-1111-4111-8111-aaaaaaaaaaa2';
const milk = 'fa111111-1111-4111-8111-222222222222';
const milk1l = 'fa111111-1111-4111-8111-bbbbbbbbbbb1';
const donJose = 'fa222222-2222-4222-8222-000000000001';
const ara = 'fa222222-2222-4222-8222-000000000002';
const calarca = 'fa222222-2222-4222-8222-000000000003';
// Punto de consulta en el centro de Armenia; las tiendas de prueba están unos 120 m al norte.
const riceImage = {
  url: 'https://images.openfoodfacts.org/arroz.jpg',
  source: 'open_food_facts',
  attribution: 'Open Food Facts, CC BY-SA',
} as const;
const userLocation = { lat: '4.5339', lng: '-75.6811' };

describe('GET /v1/featured-products: canasta básica de hoy (B#120 y B#128)', () => {
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
      brand: 'Diana',
      categoryCode: 'grains-groceries',
      image: riceImage,
      presentations: [
        { id: rice500g, quantity: 500, unit: 'g', packCount: 1 },
        { id: rice1kg, quantity: 1, unit: 'kg', packCount: 1 },
      ],
    });
    await catalog.save({
      id: milk,
      name: 'Leche entera',
      categoryCode: 'dairy-eggs',
      presentations: [{ id: milk1l, quantity: 1, unit: 'l', packCount: 1 }],
    });
    const stores = app.get(ImportEstablishments);
    const shop = (
      id: string,
      name: string,
      municipality: 'armenia' | 'calarca' = 'armenia',
      place: { address?: string; neighborhood?: string } = {},
    ) =>
      stores.save({ id, name, type: 'barrio', lat: 4.535, lng: -75.6811, municipality, ...place });
    // H-06: la dirección y el barrio salen con la tienda; la de Calarcá no los tiene y no los muestra.
    await shop(donJose, 'Tienda Don José', 'armenia', {
      address: 'Cra. 14 # 20-30',
      neighborhood: 'Centro',
    });
    await shop(ara, 'Ara Centro', 'armenia', { address: 'Cl. 21 # 15-10' });
    await shop(calarca, 'Tienda de Calarcá', 'calarca');
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    const price = (presentationId: string, establishmentId: string, priceCop: number) => ({
      presentationId,
      establishmentId,
      reportId: crypto.randomUUID(),
      priceCop,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
    await db.insert(priceCurrent).values([
      price(rice500g, donJose, 2500),
      // 1 kg a $4.400 es $440 por 100 g: más barato que 500 g a $2.500.
      price(rice1kg, ara, 4400),
      price(milk1l, donJose, 4800),
      // Calarcá no es Armenia: ni cuenta ni compite.
      price(rice500g, calarca, 1000),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const featured = (query: Record<string, string>) =>
    request(server).get('/v1/featured-products').query(query);

  it('responde 200 con el criterio y los productos con más tiendas primero, pública y con caché de 60 s', async () => {
    const response = await featured({ municipality: 'armenia' }).expect(200);

    expect(response.headers['cache-control']).toBe(CACHE_PRICES);
    expect(response.body).toEqual({
      criteria: { municipality: 'armenia', sort: 'store_count' },
      // Don José y Ara tienen precios vigentes en Armenia.
      storesWithPrices: 2,
      total: 2,
      hasMore: false,
      items: [
        {
          productId: rice,
          name: 'Arroz',
          brand: 'Diana',
          category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
          image: riceImage,
          storeCount: 2,
          cheapest: {
            presentationId: rice1kg,
            label: 'Arroz Diana · 1 kg',
            priceCop: 4400,
            unitPrice: { valueCop: 440, per: '100g' },
            establishment: { id: ara, name: 'Ara Centro', address: 'Cl. 21 # 15-10' },
          },
          // 500 g a $2.500 es $500 por 100 g: el más caro. $440 frente a $500, 12 % menos.
          priciest: {
            presentationId: rice500g,
            label: 'Arroz Diana · 500 g',
            priceCop: 2500,
            unitPrice: { valueCop: 500, per: '100g' },
            establishment: {
              id: donJose,
              name: 'Tienda Don José',
              address: 'Cra. 14 # 20-30',
              neighborhood: 'Centro',
            },
          },
          savingsPercent: 12,
        },
        {
          productId: milk,
          name: 'Leche entera',
          category: { code: 'dairy-eggs', name: 'Lácteos y huevos' },
          storeCount: 1,
          cheapest: {
            presentationId: milk1l,
            label: 'Leche entera · 1 l',
            priceCop: 4800,
            unitPrice: { valueCop: 480, per: '100ml' },
            establishment: {
              id: donJose,
              name: 'Tienda Don José',
              address: 'Cra. 14 # 20-30',
              neighborhood: 'Centro',
            },
          },
        },
      ],
    });
  });

  it('limit recorta la lista y un municipio sin precios responde vacío', async () => {
    const [first, empty] = await Promise.all([
      featured({ municipality: 'armenia', limit: '1' }).expect(200),
      featured({ municipality: 'salento' }).expect(200),
    ]);

    expect((first.body as { items: { productId: string }[] }).items).toEqual([
      expect.objectContaining({ productId: rice }),
    ]);
    expect(empty.body).toEqual({
      criteria: { municipality: 'salento', sort: 'store_count' },
      storesWithPrices: 0,
      total: 0,
      hasMore: false,
      items: [],
    });
  });

  it('paginar de a uno recorre toda la lista sin repetir ni saltar productos', async () => {
    const all = await featured({ municipality: 'armenia', limit: '50' }).expect(200);
    const allIds = (all.body as { items: { productId: string }[] }).items.map((i) => i.productId);
    const seen: string[] = [];
    let offset = 0;
    for (;;) {
      const page = await featured({
        municipality: 'armenia',
        limit: '1',
        offset: String(offset),
      }).expect(200);
      const body = page.body as {
        items: { productId: string }[];
        total: number;
        hasMore: boolean;
      };
      expect(body.total).toBe(allIds.length);
      seen.push(...body.items.map((item) => item.productId));
      if (!body.hasMore) break;
      offset += 1;
    }

    expect(seen).toEqual(allIds);
    expect(new Set(seen).size).toBe(seen.length);
    expect((all.body as { hasMore: boolean }).hasMore).toBe(false);
  });

  it('un offset más allá del final responde 200 vacío con el total', async () => {
    const response = await featured({ municipality: 'armenia', offset: '99' }).expect(200);

    expect(response.body).toMatchObject({ items: [], total: 2, hasMore: false });
  });

  it('la caché depende de la URL: cada página con su offset, pública sin ubicación y no-store con ella', async () => {
    const [second, located] = await Promise.all([
      featured({ municipality: 'armenia', limit: '1', offset: '1' }).expect(200),
      featured({ ...userLocation, limit: '1', offset: '1' }).expect(200),
    ]);

    expect(second.headers['cache-control']).toBe(CACHE_PRICES);
    expect(located.headers['cache-control']).toBe('no-store');
    expect((second.body as { items: { productId: string }[] }).items).toEqual([
      expect.objectContaining({ productId: milk }),
    ]);
    // Los parámetros de paginación van en la query: la clave de caché ya los distingue y no hace falta Vary.
    expect(second.headers['vary'] ?? '').not.toMatch(/offset|limit/i);
  });

  it('con If-None-Match igual al ETag responde 304', async () => {
    const first = await featured({ municipality: 'armenia' }).expect(200);
    const etag = first.headers['etag'];

    expect(etag).toBeDefined();
    await featured({ municipality: 'armenia' })
      .set('If-None-Match', etag ?? '')
      .expect(304);
  });

  it('400 sin municipio ni ubicación, con un municipio que no es del Quindío, con un limit o un radio fuera de rango, o con lat sin lng', async () => {
    const responses = await Promise.all([
      featured({}),
      featured({ municipality: 'pereira' }),
      featured({ municipality: 'armenia', limit: '51' }),
      featured({ ...userLocation, radiusKm: '4' }),
      featured({ lat: userLocation.lat }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
  });

  it('400 con offset negativo, decimal o que no es un número, y con limit en 0', async () => {
    const responses = await Promise.all(
      [
        { offset: '-1' },
        { offset: '1.5' },
        { offset: 'abc' },
        { limit: '0' },
        { limit: '51' },
      ].map((bad) => featured({ municipality: 'armenia', ...bad })),
    );

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
    for (const response of responses) {
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('con la ubicación cuentan las tiendas del radio, la más barata trae su distancia y no se guarda en caché', async () => {
    const response = await featured(userLocation).expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      criteria: { radiusKm: 1.5, sort: 'store_count' },
      // La tienda de Calarcá de prueba está en el mismo punto: con la ubicación también cuenta.
      storesWithPrices: 3,
      items: [
        {
          productId: rice,
          storeCount: 3,
          cheapest: {
            priceCop: 1000,
            establishment: { id: calarca, distanceM: expect.closeTo(122, -1) as unknown },
          },
        },
        { productId: milk },
      ],
    });
  });

  it('con la ubicación y el municipio, el radio solo mira ese municipio', async () => {
    const response = await featured({
      ...userLocation,
      municipality: 'armenia',
      radiusKm: '3',
    }).expect(200);

    expect(response.body).toMatchObject({
      criteria: { municipality: 'armenia', radiusKm: 3, sort: 'store_count' },
      storesWithPrices: 2,
    });
  });

  it('con una categoría, solo sus productos; con una categoría desconocida, la lista vacía', async () => {
    const [dairy, unknown] = await Promise.all([
      featured({ municipality: 'armenia', category: 'dairy-eggs' }).expect(200),
      featured({ municipality: 'armenia', category: 'no-existe' }).expect(200),
    ]);

    expect(dairy.body).toMatchObject({
      criteria: { municipality: 'armenia', category: 'dairy-eggs', sort: 'store_count' },
      items: [{ productId: milk }],
    });
    expect((dairy.body as { items: unknown[] }).items).toHaveLength(1);
    expect((unknown.body as { items: unknown[] }).items).toEqual([]);
  });

  // EC-08 y RF-005 RN5: la ubicación del usuario no se guarda, no se registra ni se expone.
  it('la ubicación consultada no aparece en la respuesta ni en el log, y no se guarda', async () => {
    const preciseLocation = { lat: '4.53387654', lng: '-75.68123456' };
    const rowsBefore = await countAllRows(db);
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    };
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);

    // Con el registro real de NestJS, como en la prueba de la comparación. Pase lo que pase, la app
    // se cierra y la salida vuelve a la consola.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(new ConsoleLogger())
      .compile();
    const loggedApp = moduleRef.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    let response: request.Response;
    try {
      configureApp(loggedApp);
      await loggedApp.init();
      response = await request(loggedApp.getHttpServer() as Parameters<typeof request>[0])
        .get('/v1/featured-products')
        .query(preciseLocation);
    } finally {
      await loggedApp.close();
      stdout.mockRestore();
      stderr.mockRestore();
    }

    expect(response.status).toBe(200);

    const output = written.join('') + JSON.stringify(response.body);
    expect((response.body as { items: unknown[] }).items).not.toHaveLength(0);
    expect(output).not.toContain(preciseLocation.lat);
    expect(output).not.toContain(preciseLocation.lng);
    expect(await countAllRows(db)).toBe(rowsBefore);
  });
});
