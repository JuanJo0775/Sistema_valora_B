import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleEstablishmentRepository } from '../../src/modules/establishments/infrastructure/drizzle-establishment-repository';
import { establishments } from '../../src/modules/establishments/infrastructure/schema';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Punto de consulta en el centro de Armenia. Cada 0,0009° de latitud son unos 100 m.
const center = { lat: 4.5339, lng: -75.6811 };
const at = (metersNorth: number) => ({ lat: center.lat + metersNorth * 0.000009, lng: center.lng });

// Tiendas de prueba: solo existen dentro de esta prueba.
const near = { id: '11111111-1111-4111-8111-111111111111', name: 'Tienda de prueba A' };
const middle = { id: '22222222-2222-4222-8222-222222222222', name: 'Tienda de prueba B' };

describe('repositorio de establecimientos con PostGIS', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let repository: DrizzleEstablishmentRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    repository = new DrizzleEstablishmentRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate establishments.establishments`);
  });

  it('devuelve las tiendas dentro del radio, de la más cercana a la más lejana, con distancia y coordenadas', async () => {
    await db.insert(establishments).values([
      { ...middle, type: 'minimercado', location: at(500) },
      { ...near, type: 'barrio', address: 'Cra. 14 #20-30', location: at(100) },
    ]);

    const found = await repository.findNearby({ ...center, radiusMeters: 1000, limit: 20 });

    expect(found.map((store) => store.name)).toEqual([near.name, middle.name]);
    expect(found[0]).toEqual({
      ...near,
      type: 'barrio',
      address: 'Cra. 14 #20-30',
      lat: expect.closeTo(at(100).lat, 6) as unknown,
      lng: expect.closeTo(center.lng, 6) as unknown,
      // Grill de la #106: sin municipio explícito, una tienda es de Armenia.
      municipality: 'armenia',
      distanceM: expect.any(Number) as unknown,
    });
    expect(Math.abs((found[0]?.distanceM ?? 0) - 100)).toBeLessThan(5);
    expect(Math.abs((found[1]?.distanceM ?? 0) - 500)).toBeLessThan(10);
  });

  it('deja fuera las tiendas que están más lejos que el radio', async () => {
    await db.insert(establishments).values([
      { ...near, type: 'barrio', location: at(100) },
      { ...middle, type: 'supermercado', location: at(3000) },
    ]);

    const found = await repository.findNearby({ ...center, radiusMeters: 1000, limit: 20 });

    expect(found.map((store) => store.name)).toEqual([near.name]);
  });

  it('devuelve como máximo el límite pedido, quedándose con las más cercanas', async () => {
    await db.insert(establishments).values([
      { ...middle, type: 'barrio', location: at(500) },
      { ...near, type: 'barrio', location: at(100) },
    ]);

    const found = await repository.findNearby({ ...center, radiusMeters: 1000, limit: 1 });

    expect(found.map((store) => store.name)).toEqual([near.name]);
  });

  // Grill de la #106 (RF-009 RN5): cada tienda dice su municipio y se puede filtrar por él.
  describe('municipio', () => {
    const calarca = { id: '33333333-3333-4333-8333-333333333333', name: 'Tienda de Calarcá' };

    beforeEach(async () => {
      await db.insert(establishments).values([
        { ...near, type: 'barrio', location: at(100) },
        { ...middle, type: 'minimercado', location: at(500) },
        { ...calarca, type: 'barrio', municipality: 'calarca', location: at(300) },
      ]);
    });

    it('la tienda dice su municipio en el detalle', async () => {
      await expect(repository.findById(calarca.id)).resolves.toMatchObject({
        municipality: 'calarca',
      });
    });

    it('de una lista de tiendas, las de un municipio, sin distancia y por nombre', async () => {
      const found = await repository.findInMunicipality({
        ids: [near.id, middle.id, calarca.id],
        municipality: 'armenia',
      });

      expect(found.map((store) => store.name)).toEqual([near.name, middle.name]);
      expect(found[0]).not.toHaveProperty('distanceM');
    });

    it('dentro del radio también se puede pedir un solo municipio', async () => {
      const found = await repository.findWithinRadius({
        ids: [near.id, middle.id, calarca.id],
        ...center,
        radiusMeters: 1000,
        municipality: 'calarca',
      });

      expect(found.map((store) => store.name)).toEqual([calarca.name]);
    });
  });
});
