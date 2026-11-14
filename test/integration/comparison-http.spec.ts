import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { priceCurrent } from '../../src/modules/comparison/infrastructure/schema';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { signIn } from '../support/sign-in';

// Producto, presentación y tienda de prueba: solo existen dentro de esta prueba.
const productId = 'a7777777-7777-4777-8777-111111111111';
const presentationId = 'a7777777-7777-4777-8777-aaaaaaaaaaaa';
const storeId = 'a8888888-8888-4888-8888-111111111111';
// Punto de consulta en el centro de Armenia; la tienda está unos 120 m al norte.
const userLocation = { lat: '4.5339', lng: '-75.6811' };

describe('GET /v1/products/{productId}/comparison', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;

  beforeAll(async () => {
    // Intervalo muy largo: el repartidor del outbox se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
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
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    await app.get(ImportEstablishments).save({
      id: storeId,
      name: 'Tienda de prueba',
      type: 'barrio',
      lat: 4.535,
      lng: -75.6811,
    });
  });

  const compare = (query: Record<string, string> = userLocation, id = productId) =>
    request(server).get(`/v1/products/${id}/comparison`).query(query);

  it('responde 200 con la forma del contrato y Cache-Control no-store', async () => {
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'a9999999-9999-4999-8999-999999999999',
      priceCop: 2000,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });

    const response = await compare().expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      productId,
      criteria: { sort: 'unit_price', radiusKm: 2 },
      results: [
        {
          establishment: {
            id: storeId,
            name: 'Tienda de prueba',
            type: 'barrio',
            lat: 4.535,
            lng: -75.6811,
            distanceM: expect.closeTo(122, -1) as unknown,
          },
          presentationId,
          priceCop: 2000,
          unitPrice: { valueCop: 400, per: '100g' },
          source: 'comunidad',
          freshness: 'vigente',
          isCheapest: true,
          observedAt: observedAt.toISOString(),
        },
      ],
      promotions: [],
    });
  });

  it.each([
    ['un productId que no es UUID', userLocation, 'producto-1', 'productId: debe ser un UUID'],
    ['sin lat', { lng: userLocation.lng }, productId, 'lat: debe estar entre -90 y 90'],
    [
      'con radiusKm 5',
      { ...userLocation, radiusKm: '5' },
      productId,
      'radiusKm: debe estar entre 0,5 y 3',
    ],
    [
      'con un sort desconocido',
      { ...userLocation, sort: 'promoted' },
      productId,
      'sort: debe ser unit_price, distance o recent',
    ],
    [
      'con onlyCurrent que no es booleano',
      { ...userLocation, onlyCurrent: 'si' },
      productId,
      'onlyCurrent: debe ser true o false',
    ],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, query, id, message) => {
    const response = await compare(query, id).expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
  });

  it('un producto que no existe responde 404', async () => {
    const response = await compare(userLocation, 'a7777777-7777-4777-8777-999999999999').expect(
      404,
    );

    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Recurso no encontrado.' });
  });

  // EC-08 y RF-005 RN5: la ubicación del usuario no se guarda, no se registra ni se expone.
  it('la ubicación consultada no aparece en la respuesta ni en el log, y no se guarda', async () => {
    const preciseLocation = { lat: '4.53387654', lng: '-75.68123456' };
    // Con un precio, la ubicación llega hasta la consulta de las tiendas en el radio.
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'a9999999-9999-4999-8999-999999999999',
      priceCop: 2000,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
    const rowsBefore = await countAllRows(db);
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    };
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);

    // Con el registro real de NestJS, como en la prueba de /nearby (#50).
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(new ConsoleLogger())
      .compile();
    const loggedApp = moduleRef.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    configureApp(loggedApp);
    await loggedApp.init();
    const response = await request(loggedApp.getHttpServer() as Parameters<typeof request>[0])
      .get(`/v1/products/${productId}/comparison`)
      .query(preciseLocation)
      .expect(200);
    await loggedApp.close();
    stdout.mockRestore();
    stderr.mockRestore();

    const output = written.join('') + JSON.stringify(response.body);
    expect((response.body as { results: unknown[] }).results).toHaveLength(1);
    expect(output).not.toContain(preciseLocation.lat);
    expect(output).not.toContain(preciseLocation.lng);
    expect(await countAllRows(db)).toBe(rowsBefore);
  });

  // El reportante necesita sesión (#62); la comparación se consulta sin ella: sigue siendo pública.
  it('de punta a punta: un reporte con sesión llega por el outbox y la comparación lo muestra sin sesión', async () => {
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    const reporter = await signIn(server, db, 'reportante@correo.com');
    const observedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await request(server)
      .post('/v1/reports')
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .set('Idempotency-Key', 'a6666666-6666-4666-8666-666666666666')
      .send({ presentationId, establishmentId: storeId, priceCop: 4500, observedAt })
      .expect(201);

    // Dos pasos del outbox: PriceReported → reliability, y PriceAssessed → comparison (#31).
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
    const response = await compare().expect(200);

    expect(response.body).toMatchObject({
      results: [
        {
          establishment: { id: storeId },
          priceCop: 4500,
          unitPrice: { valueCop: 900, per: '100g' },
          freshness: 'vigente',
          observedAt,
        },
      ],
    });
  });
});

// Total de filas en todas las tablas de la aplicación (sin las de PostgreSQL y PostGIS).
async function countAllRows(db: Database): Promise<number> {
  const tables = await db.execute<{ name: string }>(
    sql`select format('%I.%I', table_schema, table_name) as name from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in ('pg_catalog', 'information_schema', 'public', 'topology')`,
  );
  let total = 0;
  for (const { name } of tables.rows) {
    const result = await db.execute<{ count: string }>(
      sql.raw(`select count(*) as count from ${name}`),
    );
    total += Number(result.rows[0]?.count ?? 0);
  }
  return total;
}
