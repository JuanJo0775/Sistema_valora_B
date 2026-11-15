import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const productId = 'ee111111-1111-4111-8111-111111111111';
const presentationId = 'ee111111-1111-4111-8111-aaaaaaaaaaaa';
const storeId = (index: number) => `ee222222-2222-4222-8222-${String(index).padStart(12, '0')}`;
const STORES = 10;
const QUEUED = 50;
// PR-08: p95 de confirmación de 60 segundos o menos tras reconectar.
const P95_LIMIT_MS = 60_000;

interface Queued {
  key: string;
  store: string;
  priceCop: number;
  observedAt: string;
}

// Orden pseudoaleatorio pero repetible: la prueba no depende del orden de llegada.
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  let seed = 7;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const other = Math.floor((seed / 233280) * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

const percentile = (values: number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
};

// RF-007, EC-07 y PR-08 (grill de la #30): el lado del servidor de la cola sin conexión. La cola en
// IndexedDB y la prueba con Playwright van en Sistema_valora_F.
describe('sincronización de la cola sin conexión (PR-08, #30)', () => {
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
      sql`truncate identity.sessions, identity.accounts, pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals, reliability.bursts, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de la cola',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    for (let index = 0; index < STORES; index += 1) {
      await app.get(ImportEstablishments).save({
        id: storeId(index),
        name: `Tienda ${String(index)}`,
        type: 'barrio',
        lat: 4.53 + index * 0.001,
        lng: -75.68,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('50 reportes enviados juntos, en desorden y reintentados: 100 % recibidos, 0 duplicados y p95 bajo 60 s', async () => {
    const reporter = await signIn(server, db, 'cola@correo.com');
    // Un reporte cada 15 minutos durante unas 12 horas, repartidos en 10 tiendas.
    const queue: Queued[] = Array.from({ length: QUEUED }, (_, index) => ({
      key: crypto.randomUUID(),
      store: storeId(index % STORES),
      priceCop: 2000 + index,
      observedAt: new Date(Date.now() - (index + 1) * 15 * 60 * 1000).toISOString(),
    }));
    const send = (queued: Queued) =>
      request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .set('Idempotency-Key', queued.key)
        .send({
          presentationId,
          establishmentId: queued.store,
          priceCop: queued.priceCop,
          observedAt: queued.observedAt,
        });

    // Al reconectar: cada reporte se manda dos veces al mismo tiempo (la PWA reintenta porque no
    // vio la respuesta) y una tercera vez después; en desorden.
    const start = Date.now();
    const confirmedAt = new Map<string, number>();
    const firstRound = await Promise.all(
      shuffled(queue).map(async (queued) => {
        const [first, second] = await Promise.all([send(queued), send(queued)]);
        confirmedAt.set(queued.key, Date.now() - start);
        return [first, second];
      }),
    );
    const retries = await Promise.all(shuffled(queue).map(send));
    const relay = app.get(OutboxRelay);
    await relay.runOnce();
    await relay.runOnce();

    const statuses = [...firstRound.flat(), ...retries].map((response) => response.status);
    expect(statuses.every((status) => status === 200 || status === 201)).toBe(true);
    // 100 % recibidos y 0 duplicados: 50 reportes y 50 eventos, uno por clave.
    const saved = await db.execute<{ total: string }>(
      sql`select count(*) as total from pricing.reports`,
    );
    const events = await db.execute<{ total: string }>(
      sql`select count(*) as total from shared.outbox where type = 'PriceReported'`,
    );
    expect([Number(saved.rows[0]?.total), Number(events.rows[0]?.total)]).toEqual([QUEUED, QUEUED]);
    // Un reporte tardío no reemplaza uno más reciente: cada tienda muestra el observado más tarde.
    const current = await db.execute<{ establishment_id: string; price_cop: number }>(
      sql`select establishment_id, price_cop from comparison.price_current`,
    );
    const newestByStore = new Map<string, number>();
    for (let index = 0; index < STORES; index += 1) {
      const ofStore = queue.filter((queued) => queued.store === storeId(index));
      const newest = ofStore.reduce((a, b) => (a.observedAt > b.observedAt ? a : b));
      newestByStore.set(storeId(index), newest.priceCop);
    }
    expect(new Map(current.rows.map((row) => [row.establishment_id, row.price_cop]))).toEqual(
      newestByStore,
    );
    // PR-08: p95 de confirmación tras reconectar.
    const p95 = percentile([...confirmedAt.values()], 0.95);
    expect(p95).toBeLessThanOrEqual(P95_LIMIT_MS);
    process.stdout.write(
      `Sincronización: ${String(QUEUED)} reportes, ${String(statuses.length)} envíos, p95 de confirmación ${String(p95)} ms.\n`,
    );
  });
});
