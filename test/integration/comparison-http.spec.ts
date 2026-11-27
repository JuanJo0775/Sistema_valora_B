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
import { contractErrors } from '../support/contract';
import { countAllRows } from '../support/count-rows';
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
      sql`truncate pricing.reports, shared.outbox, shared.processed_events, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.official_reviews, catalog.presentations, catalog.products, catalog.wholesale_references, establishments.establishments`,
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
      address: 'Cra. 14 # 20-30',
      neighborhood: 'Centro',
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
            address: 'Cra. 14 # 20-30',
            neighborhood: 'Centro',
            lat: 4.535,
            lng: -75.6811,
            municipality: 'armenia',
            distanceM: expect.closeTo(122, -1) as unknown,
          },
          // Grill de la #32, pregunta 3: el reporte que se muestra, para poder marcarlo.
          reportId: 'a9999999-9999-4999-8999-999999999999',
          presentationId,
          priceCop: 2000,
          unitPrice: { valueCop: 400, per: '100g' },
          source: 'comunidad',
          freshness: 'vigente',
          isCheapest: true,
          // Sin observación en reliability (precio cargado a mano): cuenta como baja (#31).
          reliability: 'baja',
          confirmations: 0,
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
    // Grill de la #106.
    [
      'con un municipio que no es del Quindío',
      { municipality: 'pereira' },
      productId,
      'municipality: debe ser un municipio del Quindío',
    ],
    [
      'por distancia sin ubicación',
      { municipality: 'armenia', sort: 'distance' },
      productId,
      'sort: para ordenar por distancia hay que enviar lat y lng',
    ],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, query, id, message) => {
    const response = await compare(query, id).expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
  });

  // Grill de la #34 (RF-014 RN3): la referencia SIPSA sale aparte, nunca como precio de una tienda.
  it('la referencia SIPSA reciente sale en wholesaleReference, sin el responsable de la carga', async () => {
    const today = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await app.get(ImportCatalog).saveReference({
      id: 'a8888888-8888-4888-8888-000000000001',
      productId,
      sipsaName: 'Arroz blanco',
      market: 'Armenia, Mercar',
      periodStart: today,
      periodEnd: today,
      pricePerKgCop: 3200,
      sourceUrl: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
      responsible: 'Integrante del equipo',
      consultedAt: today,
    });

    const response = await compare().expect(200);

    expect((response.body as { wholesaleReference: unknown }).wholesaleReference).toEqual({
      source: 'SIPSA (DANE)',
      productName: 'Arroz blanco',
      market: 'Armenia, Mercar',
      pricePerKgCop: 3200,
      periodStart: today,
      periodEnd: today,
      url: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
    });
    expect(JSON.stringify(response.body)).not.toContain('Integrante del equipo');
  });

  // Grill de la #106 (RF-009 RN5): comparar en un municipio sin compartir la ubicación (EC-08).
  it('con municipio y sin ubicación responde las tiendas del municipio, sin distancia', async () => {
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values({
      presentationId,
      establishmentId: storeId,
      reportId: 'a9999999-9999-4999-8999-000000000106',
      priceCop: 2000,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });

    const inArmenia = await compare({ municipality: 'armenia' }).expect(200);
    const inCalarca = await compare({ municipality: 'calarca' }).expect(200);

    const body = inArmenia.body as {
      criteria: unknown;
      results: { establishment: Record<string, unknown> }[];
    };
    expect(body.criteria).toEqual({ sort: 'unit_price', municipality: 'armenia' });
    expect(body.results[0]?.establishment).toMatchObject({ id: storeId, municipality: 'armenia' });
    expect(body.results[0]?.establishment).not.toHaveProperty('distanceM');
    expect((inCalarca.body as { results: unknown[] }).results).toEqual([]);
  });

  it('con presentationId compara solo esa presentación; con una ajena responde 404 y con un texto, 400', async () => {
    const kiloId = 'a7777777-7777-4777-8777-bbbbbbbbbbbb';
    await app.get(ImportCatalog).save({
      id: productId,
      name: 'Arroz de prueba',
      categoryCode: 'grains-groceries',
      presentations: [
        { id: presentationId, quantity: 500, unit: 'g', packCount: 1 },
        { id: kiloId, quantity: 1, unit: 'kg', packCount: 1 },
      ],
    });
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(priceCurrent).values([
      {
        presentationId,
        establishmentId: storeId,
        reportId: 'a9999999-9999-4999-8999-999999999991',
        priceCop: 2400,
        priceType: 'normal',
        observedAt,
        receivedAt: observedAt,
      },
      {
        presentationId: kiloId,
        establishmentId: storeId,
        reportId: 'a9999999-9999-4999-8999-999999999992',
        priceCop: 4000,
        priceType: 'normal',
        observedAt,
        receivedAt: observedAt,
      },
    ]);

    const all = await compare().expect(200);
    const grams = await compare({ ...userLocation, presentationId }).expect(200);
    const kilo = await compare({ ...userLocation, presentationId: kiloId }).expect(200);

    expect((all.body as { results: unknown[] }).results).toHaveLength(2);
    expect(grams.body).toMatchObject({ results: [{ presentationId, priceCop: 2400 }] });
    expect((grams.body as { results: unknown[] }).results).toHaveLength(1);
    expect(kilo.body).toMatchObject({ results: [{ presentationId: kiloId, priceCop: 4000 }] });
    expect(
      contractErrors('GET /products/{productId}/comparison', 200, grams.body as unknown),
    ).toEqual([]);
    await compare({
      ...userLocation,
      presentationId: 'a7777777-7777-4777-8777-cccccccccccc',
    }).expect(404);
    await compare({ ...userLocation, presentationId: 'no-es-un-uuid' }).expect(400);
  });

  it('un producto que no existe responde 404', async () => {
    const response = await compare(userLocation, 'a7777777-7777-4777-8777-999999999999').expect(
      404,
    );

    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Recurso no encontrado.' });
  });

  it('dice cuánto menos cuesta el más barato que la tienda más cara (B#128)', async () => {
    const otherStore = 'a8888888-8888-4888-8888-222222222222';
    await app.get(ImportEstablishments).save({
      id: otherStore,
      name: 'Otra tienda de prueba',
      type: 'barrio',
      lat: 4.535,
      lng: -75.6811,
    });
    const observedAt = new Date(Date.now() - 60 * 60 * 1000);
    const at = (establishmentId: string, priceCop: number) => ({
      presentationId,
      establishmentId,
      reportId: crypto.randomUUID(),
      priceCop,
      priceType: 'normal',
      observedAt,
      receivedAt: observedAt,
    });
    await db.insert(priceCurrent).values([at(storeId, 2000), at(otherStore, 2500)]);

    const response = await compare().expect(200);

    // $2.000 frente a $2.500 por los mismos 500 g: 20 % menos.
    expect(response.body).toMatchObject({ savingsPercent: 20 });
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
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
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

  // Grill de la #31: pricing → reliability → comparison, con la confiabilidad en la respuesta.
  it('de punta a punta con reliability: dos cuentas que coinciden suman una confirmación y un precio fuera de rango no reemplaza al vigente', async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    const relay = app.get(OutboxRelay);
    const reportAs = async (email: string, priceCop: number, minutesAgo: number) => {
      const reporter = await signIn(server, db, email);
      await request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          presentationId,
          establishmentId: storeId,
          priceCop,
          observedAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
        })
        .expect(201);
      await relay.runOnce();
      await relay.runOnce();
      return reporter;
    };

    const ana = await reportAs('ana@correo.com', 4500, 40);
    const beto = await reportAs('beto@correo.com', 4550, 30);
    const confirmed = await compare().expect(200);
    expect(confirmed.body).toMatchObject({
      results: [{ priceCop: 4550, confirmations: 1, reliability: 'media' }],
    });

    const caro = await reportAs('caro@correo.com', 4500, 20);
    const dani = await reportAs('dani@correo.com', 1500, 10);
    const afterAttack = await compare().expect(200);
    expect(afterAttack.body).toMatchObject({ results: [{ priceCop: 4500 }] });

    // EC-08: ni las observaciones de reliability ni los eventos llevan el id de la cuenta o el correo.
    const stored = await db.execute(sql`select * from reliability.observations`);
    const events = await db.execute(sql`select payload from shared.outbox`);
    const everything = JSON.stringify([stored.rows, events.rows]);
    for (const reporter of [ana, beto, caro, dani]) {
      expect(everything).not.toContain(reporter.accountId);
    }
    expect(everything).not.toContain('@correo.com');
  });

  // Grill de la #32: marcar → cola → descartar → la comparación vuelve al precio confiable.
  it('de punta a punta con moderación: un precio marcado y descartado deja de mostrarse, y la cola no expone a nadie', async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    const relay = app.get(OutboxRelay);
    const reportAs = async (email: string, priceCop: number, minutesAgo: number) => {
      const reporter = await signIn(server, db, email);
      await request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('X-CSRF-Token', reporter.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          presentationId,
          establishmentId: storeId,
          priceCop,
          observedAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
        })
        .expect(201);
      await relay.runOnce();
      await relay.runOnce();
      return reporter;
    };
    const ana = await reportAs('ana@correo.com', 4000, 120);
    // Sin referencias suficientes no se detecta: el precio falso se muestra.
    const beto = await reportAs('beto@correo.com', 2500, 60);
    const shown = await compare().expect(200);
    const [fake] = (shown.body as { results: { reportId: string; priceCop: number }[] }).results;
    expect(fake?.priceCop).toBe(2500);

    await request(server)
      .post(`/v1/reports/${fake?.reportId ?? ''}/flag`)
      .set('Cookie', ana.cookie)
      .set('X-CSRF-Token', ana.csrfToken)
      .send({ reason: 'precio_falso', comment: 'En la tienda está a $4.000' })
      .expect(202);
    const moderator = await signIn(server, db, 'moderadora@correo.com', 'moderador');
    const queue = await request(server)
      .get('/v1/moderation/queue')
      .set('Cookie', moderator.cookie)
      .expect(200);
    expect(queue.body).toMatchObject({
      items: [
        {
          id: fake?.reportId,
          reason: 'marcado',
          productName: 'Arroz de prueba · 500 g',
          establishmentName: 'Tienda de prueba',
          reportedPriceCop: 2500,
          reportersCount: 1,
        },
      ],
    });
    // EC-08: la cola no dice quién reportó ni quién marcó.
    const listed = JSON.stringify(queue.body);
    for (const account of [ana, beto]) expect(listed).not.toContain(account.accountId);
    expect(listed).not.toContain('@correo.com');

    await request(server)
      .post(`/v1/moderation/${fake?.reportId ?? ''}/decision`)
      .set('Cookie', moderator.cookie)
      .set('X-CSRF-Token', moderator.csrfToken)
      .send({ decision: 'descartar', note: 'Precio falso: otra cuenta lo vio a $4.000' })
      .expect(204);
    await relay.runOnce();

    const afterDecision = await compare().expect(200);
    expect(afterDecision.body).toMatchObject({ results: [{ priceCop: 4000 }] });
  });
});
