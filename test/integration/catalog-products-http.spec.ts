import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { presentations, products } from '../../src/modules/catalog/infrastructure/schema';
import { DATABASE, type Database } from '../../src/shared/database/database.module';

const riceId = '3f1c2a64-5c1e-4b8a-9d61-0a7b1f2e3c4d';

describe('GET /v1/products/{productId}', () => {
  let app: INestApplication;
  let server: App;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate catalog.presentations, catalog.products`);
    await db
      .insert(products)
      .values({
        id: riceId,
        name: 'Arroz blanco',
        brand: 'Diana',
        categoryCode: 'grains-groceries',
      });
    await db.insert(presentations).values({
      id: '9a2e7c10-1b2d-4e3f-8a9b-0c1d2e3f4a5b',
      productId: riceId,
      quantity: '1',
      unit: 'kg',
      barcode: '7702511000014',
    });
  });

  it('responde el producto con su categoría y presentaciones, y una caché pública de 5 minutos', async () => {
    const response = await request(server).get(`/v1/products/${riceId}`).expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body).toEqual({
      id: riceId,
      name: 'Arroz blanco',
      brand: 'Diana',
      category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
      presentations: [
        {
          id: '9a2e7c10-1b2d-4e3f-8a9b-0c1d2e3f4a5b',
          barcode: '7702511000014',
          quantity: 1,
          unit: 'kg',
          packCount: 1,
        },
      ],
    });
  });
});
