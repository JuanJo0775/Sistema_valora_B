import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { gunzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { COMPRESSION_THRESHOLD_BYTES, configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { CACHE_PRICES, NO_STORE } from '../../src/shared/http/cache-control';

// ADR-031: ahorro de ancho de banda. Compresión de respuestas y caché compartida corta.
const productId = 'b7777777-7777-4777-8777-111111111111';
const presentationId = 'b7777777-7777-4777-8777-aaaaaaaaaaaa';
const STORES = 40;

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  raw: Buffer;
}

function sMaxAge(header: unknown): number {
  const match = /s-maxage=(\d+)/.exec(String(header));
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

describe('ADR-031: compresión y caché de la API', () => {
  let app: INestApplication;
  let db: Database;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, catalog.presentations, catalog.products, catalog.wholesale_references, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    for (let i = 0; i < STORES; i += 1) {
      const id = randomUUID();
      await app.get(ImportEstablishments).save({
        id,
        name: `Tienda de prueba número ${String(i + 1)}`,
        type: 'barrio',
        address: `Cra. ${String(i + 1)} # 20-30`,
        neighborhood: 'Centro',
        lat: 4.5339 + i * 0.0002,
        lng: -75.6811,
      });
      await db.insert(priceCurrent).values({
        presentationId,
        establishmentId: id,
        reportId: randomUUID(),
        priceCop: 2000 + i * 10,
        priceType: 'normal',
        observedAt,
        receivedAt: observedAt,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  // supertest descomprime solo; para ver los bytes que viajan se usa http a pelo.
  const raw = (path: string, acceptEncoding?: string): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path,
          headers: acceptEncoding === undefined ? {} : { 'Accept-Encoding': acceptEncoding },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              raw: Buffer.concat(chunks),
            });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });

  const comparisonPath = `/v1/products/${productId}/comparison?municipality=armenia`;

  describe('compresión', () => {
    it('comprime con gzip una comparación grande y el cuerpo es equivalente al original', async () => {
      const plain = await raw(comparisonPath);
      const gzip = await raw(comparisonPath, 'gzip');

      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(gzip.headers['content-encoding']).toBe('gzip');
      expect(String(gzip.headers['vary'])).toMatch(/accept-encoding/i);
      expect(JSON.parse(gunzipSync(gzip.raw).toString('utf8'))).toEqual(
        JSON.parse(plain.raw.toString('utf8')),
      );
      expect(plain.raw.length).toBeGreaterThan(COMPRESSION_THRESHOLD_BYTES);
      // Cifra para el ADR-031.
      const saved = Math.round((1 - gzip.raw.length / plain.raw.length) * 100);
      console.info(
        `Comparación de ${String(STORES)} tiendas: ${String(plain.raw.length)} B sin comprimir, ${String(gzip.raw.length)} B con gzip (${String(saved)} % menos)`,
      );
      expect(gzip.raw.length).toBeLessThan(plain.raw.length / 3);
    });

    it('con brotli también comprime, y no peor que gzip', async () => {
      const gzip = await raw(comparisonPath, 'gzip');
      const br = await raw(comparisonPath, 'br');

      expect(br.headers['content-encoding']).toBe('br');
      console.info(`Con brotli: ${String(br.raw.length)} B (gzip: ${String(gzip.raw.length)} B)`);
      expect(br.raw.length).toBeLessThanOrEqual(gzip.raw.length);
    });

    it('sin Accept-Encoding la respuesta viaja sin comprimir', async () => {
      const plain = await raw(comparisonPath);

      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(() => {
        JSON.parse(plain.raw.toString('utf8'));
      }).not.toThrow();
    });

    it('una respuesta menor que 1 kB no se comprime', async () => {
      const small = await raw('/v1/categories', 'gzip');

      expect(small.status).toBe(200);
      expect(small.raw.length).toBeLessThan(COMPRESSION_THRESHOLD_BYTES);
      expect(small.headers['content-encoding']).toBeUndefined();
    });

    it('el ETag sigue respondiendo 304 con la respuesta comprimida', async () => {
      const first = await request(server()).get(comparisonPath).set('Accept-Encoding', 'gzip');
      const etag = first.headers['etag'];

      expect(etag).toEqual(expect.any(String));
      await request(server())
        .get(comparisonPath)
        .set('Accept-Encoding', 'gzip')
        .set('If-None-Match', etag as string)
        .expect(304);
    });
  });

  describe('caché HTTP', () => {
    it('la comparación sin ubicación (solo municipio) se guarda 60 s como máximo en la caché compartida', async () => {
      const response = await request(server()).get(comparisonPath).expect(200);

      expect(response.headers['cache-control']).toBe(CACHE_PRICES);
      expect(sMaxAge(response.headers['cache-control'])).toBeLessThanOrEqual(60);
    });

    it.each([
      ['lat y lng', 'lat=4.5339&lng=-75.6811'],
      ['solo lat', 'lat=4.5339&municipality=armenia'],
      ['solo lng', 'lng=-75.6811&municipality=armenia'],
    ])('la comparación con %s no se guarda en ninguna caché', async (_name, query) => {
      const response = await request(server()).get(`/v1/products/${productId}/comparison?${query}`);

      expect(response.headers['cache-control']).toBe(NO_STORE);
    });

    it('las rutas por ubicación siguen en no-store', async () => {
      const featured = await request(server())
        .get('/v1/featured-products?lat=4.5339&lng=-75.6811')
        .expect(200);
      const nearby = await request(server())
        .get('/v1/establishments/nearby?lat=4.5339&lng=-75.6811')
        .expect(200);

      expect(featured.headers['cache-control']).toBe(NO_STORE);
      expect(nearby.headers['cache-control']).toBe(NO_STORE);
    });

    it('lo público lleva s-maxage y, si trae precios, no más de 60 s', async () => {
      const featured = await request(server()).get('/v1/featured-products?municipality=armenia');
      const history = await request(server()).get(`/v1/products/${productId}/history`);
      const categories = await request(server()).get('/v1/categories');
      const product = await request(server()).get(`/v1/products/${productId}`);

      for (const response of [featured, history]) {
        expect(response.headers['cache-control']).toMatch(/^public, /);
        expect(sMaxAge(response.headers['cache-control'])).toBeLessThanOrEqual(60);
      }
      for (const response of [categories, product]) {
        expect(response.headers['cache-control']).toMatch(/s-maxage=\d+/);
      }
    });

    it('las rutas con sesión, los reportes propios y la moderación nunca quedan en una caché pública', async () => {
      const session = await request(server()).get('/v1/auth/session');
      const mine = await request(server()).get('/v1/me/reports');
      const queue = await request(server()).get('/v1/moderation/queue');

      // Sin sesión responden 401; aun así ninguna caché compartida puede guardarlas.
      expect(session.headers['cache-control']).toBe(NO_STORE);
      for (const response of [session, mine, queue]) {
        expect(response.headers['cache-control'] ?? NO_STORE).not.toMatch(/public|s-maxage/);
      }
    });

    it('el health es liviano y no se guarda en caché', async () => {
      const response = await raw('/v1/health', 'gzip');

      expect(response.headers['cache-control']).toBe(NO_STORE);
      expect(response.raw.length).toBeLessThan(64);
    });
  });
});
