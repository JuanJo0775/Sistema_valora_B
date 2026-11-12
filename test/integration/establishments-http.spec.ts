import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { establishments } from '../../src/modules/establishments/infrastructure/schema';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

// Punto de consulta en el centro de Armenia. Cada 0,0009° de latitud son unos 100 m.
const center = { lat: 4.5339, lng: -75.6811 };
const at = (metersNorth: number) => ({ lat: center.lat + metersNorth * 0.000009, lng: center.lng });

const inside = { id: '11111111-1111-4111-8111-111111111111', name: 'Tienda de prueba A' };
const outside = { id: '22222222-2222-4222-8222-222222222222', name: 'Tienda de prueba B' };

describe('GET /v1/establishments/nearby', () => {
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
    await db.execute(sql`truncate establishments.establishments`);
    await db.insert(establishments).values([
      { ...inside, type: 'descuento', address: 'Cra. 14 #20-30', location: at(1500) },
      { ...outside, type: 'barrio', location: at(2500) },
    ]);
  });

  it('sin radio usa 2 km: responde las tiendas cercanas con sus coordenadas y sin caché', async () => {
    const response = await request(server)
      .get('/v1/establishments/nearby')
      .query(center)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      items: [
        {
          ...inside,
          type: 'descuento',
          address: 'Cra. 14 #20-30',
          lat: expect.closeTo(at(1500).lat, 6) as unknown,
          lng: expect.closeTo(center.lng, 6) as unknown,
          distanceM: expect.any(Number) as unknown,
        },
      ],
    });
  });

  it.each([
    ['falta lat', { lng: center.lng }, 'lat: debe estar entre -90 y 90'],
    ['lat fuera de rango', { ...center, lat: 91 }, 'lat: debe estar entre -90 y 90'],
    ['lng fuera de rango', { ...center, lng: -181 }, 'lng: debe estar entre -180 y 180'],
    ['radio menor que 0,5 km', { ...center, radiusKm: 0.4 }, 'radiusKm: debe estar entre 0,5 y 3'],
    ['radio mayor que 3 km', { ...center, radiusKm: 5 }, 'radiusKm: debe estar entre 0,5 y 3'],
    ['límite mayor que 50', { ...center, limit: 51 }, 'limit: debe estar entre 1 y 50'],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, query, message) => {
    const response = await request(server)
      .get('/v1/establishments/nearby')
      .query(query)
      .expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
  });
});
