import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CACHE_STATIC } from '../../src/shared/http/cache-control';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

// Issue #111: el frontend necesita la lista cerrada de categorías para proponer un producto.
describe('GET /v1/categories', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista las 8 categorías de la migración por nombre, sin sesión y con caché pública de una hora', async () => {
    const response = await request(server).get('/v1/categories').expect(200);

    expect(response.headers['cache-control']).toBe(CACHE_STATIC);
    expect(response.body).toEqual({
      items: [
        { code: 'household-cleaning', name: 'Aseo del hogar' },
        { code: 'beverages', name: 'Bebidas' },
        { code: 'meat-fish', name: 'Carnes y pescados' },
        { code: 'personal-care', name: 'Cuidado personal' },
        { code: 'fruits-vegetables', name: 'Frutas y verduras' },
        { code: 'grains-groceries', name: 'Granos y abarrotes' },
        { code: 'dairy-eggs', name: 'Lácteos y huevos' },
        { code: 'bakery', name: 'Panadería' },
      ],
    });
  });
});
