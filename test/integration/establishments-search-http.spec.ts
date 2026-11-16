import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { establishments } from '../../src/modules/establishments/infrastructure/schema';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const armenia = { lat: 4.5339, lng: -75.6811 };
const calarca = { lat: 4.5297, lng: -75.6435 };

const panaderia = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Panadería La Espiga',
  type: 'barrio',
  location: armenia,
  municipality: 'armenia',
};
const donPepe = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Tienda Don Pepe',
  type: 'barrio',
  address: 'Cra. 14 #20-30',
  location: armenia,
  municipality: 'armenia',
};
const donPepeCalarca = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Supermercado Don Pepe',
  type: 'supermercado',
  location: calarca,
  municipality: 'calarca',
};

// RF-005 y EC-08 (#116): elegir la tienda sin compartir la ubicación.
describe('GET /v1/establishments', () => {
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
    await db.insert(establishments).values([panaderia, donPepe, donPepeCalarca]);
  });

  it('busca por parte del nombre, sin tildes ni mayúsculas, ordenadas por nombre y sin distancia', async () => {
    const response = await request(server)
      .get('/v1/establishments')
      .query({ q: 'PEPE don' })
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body).toEqual({
      items: [
        {
          id: donPepeCalarca.id,
          name: 'Supermercado Don Pepe',
          type: 'supermercado',
          lat: expect.closeTo(calarca.lat, 6) as unknown,
          lng: expect.closeTo(calarca.lng, 6) as unknown,
          municipality: 'calarca',
        },
        {
          id: donPepe.id,
          name: 'Tienda Don Pepe',
          type: 'barrio',
          address: 'Cra. 14 #20-30',
          lat: expect.closeTo(armenia.lat, 6) as unknown,
          lng: expect.closeTo(armenia.lng, 6) as unknown,
          municipality: 'armenia',
        },
      ],
    });
  });
});
