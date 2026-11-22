import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportCatalog } from '../../src/modules/catalog';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { DrizzleReportRepository } from '../../src/modules/pricing/infrastructure/drizzle-report-repository';
import { OutboxPublisher, OutboxRelay } from '../../src/shared/events';
import { type SignedIn, signIn } from '../support/sign-in';

// Presentación y tienda de prueba: solo existen dentro de esta prueba.
const presentationId = 'b1111111-1111-4111-8111-aaaaaaaaaaaa';
const establishmentId = 'b2222222-2222-4222-8222-222222222222';
const idempotencyKey = 'b3333333-3333-4333-8333-333333333333';

// Un precio visto hace media hora.
const body = () => ({
  presentationId,
  establishmentId,
  priceCop: 4500,
  observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
});

describe('POST /v1/reports', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    // Una sola cuenta de reportante para todo el archivo: los límites de inicio de sesión cuentan
    // por IP.
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    reporter = await signIn(server, db, 'reportante@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate pricing.reports, comparison.price_current, reliability.observations, reliability.reputations, reliability.reputation_events, shared.outbox, shared.processed_events, catalog.presentations, catalog.products, establishments.establishments`,
    );
    await app.get(ImportCatalog).save({
      id: 'b1111111-1111-4111-8111-111111111111',
      name: 'Producto de prueba',
      categoryCode: 'grains-groceries',
      presentations: [{ id: presentationId, quantity: 500, unit: 'g', packCount: 1 }],
    });
    await app.get(ImportEstablishments).save({
      id: establishmentId,
      name: 'Tienda de prueba',
      type: 'barrio',
      lat: 4.5339,
      lng: -75.6811,
    });
  });

  // Con la sesión del reportante y su token CSRF (grill de la #16, preguntas 4 y 5).
  const post = (payload: object, key: string | null = idempotencyKey) => {
    const call = request(server)
      .post('/v1/reports')
      .set('Cookie', reporter.cookie)
      .set('X-CSRF-Token', reporter.csrfToken)
      .send(payload);
    return key === null ? call : call.set('Idempotency-Key', key);
  };

  describe('sesión y rol (#62)', () => {
    it('sin sesión responde 401 y no guarda nada', async () => {
      const response = await request(server)
        .post('/v1/reports')
        .set('Idempotency-Key', idempotencyKey)
        .send(body())
        .expect(401);

      expect(response.body).toEqual({ code: 'UNAUTHORIZED', message: 'Se requiere sesión.' });
      const saved = await db.execute(sql`select id from pricing.reports`);
      expect(saved.rows).toHaveLength(0);
    });

    it.each(['comercio', 'moderador'])('con sesión de %s responde 403 FORBIDDEN', async (role) => {
      const other = await signIn(server, db, `${role}@correo.com`, role);

      const response = await request(server)
        .post('/v1/reports')
        .set('Cookie', other.cookie)
        .set('X-CSRF-Token', other.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send(body())
        .expect(403);

      expect(response.body).toEqual({ code: 'FORBIDDEN', message: 'El rol no tiene permiso.' });
    });

    it('sin X-CSRF-Token responde 403 CSRF_TOKEN_INVALID y no guarda nada', async () => {
      const response = await request(server)
        .post('/v1/reports')
        .set('Cookie', reporter.cookie)
        .set('Idempotency-Key', idempotencyKey)
        .send(body())
        .expect(403);

      expect(response.body).toEqual({
        code: 'CSRF_TOKEN_INVALID',
        message: 'Falta el token CSRF o no coincide con la sesión.',
      });
      const saved = await db.execute(sql`select id from pricing.reports`);
      expect(saved.rows).toHaveLength(0);
    });

    // ADR-029: registrar precios exige el correo verificado, con un código estable para el frontend.
    it('con el correo sin verificar responde 403 EMAIL_NOT_VERIFIED y no guarda nada', async () => {
      const unverified = await signIn(
        server,
        db,
        'sin-verificar@correo.com',
        'reportante',
        undefined,
        false,
      );

      const response = await request(server)
        .post('/v1/reports')
        .set('Cookie', unverified.cookie)
        .set('X-CSRF-Token', unverified.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send(body())
        .expect(403);

      expect(response.body).toEqual({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Verifica tu correo para registrar precios. Revisa tu bandeja o pide un enlace nuevo.',
      });
      const saved = await db.execute(sql`select id from pricing.reports`);
      expect(saved.rows).toHaveLength(0);
    });

    it('con sesión de reportante responde 201 y el reporte guarda su cuenta', async () => {
      await post(body()).expect(201);

      const saved = await db.execute<{ reporter_id: string }>(
        sql`select reporter_id from pricing.reports`,
      );
      expect(saved.rows).toEqual([{ reporter_id: reporter.accountId }]);
    });
  });

  it('responde 201 con el recibo, y el reintento idéntico responde 200 con el mismo recibo', async () => {
    const report = body();

    const created = await post(report).expect(201);
    expect(created.body).toEqual({
      id: expect.any(String) as unknown,
      status: 'recibido',
      receivedAt: expect.any(String) as unknown,
    });

    const retry = await post(report).expect(200);
    expect(retry.body).toEqual(created.body);
  });

  // Auditoría de UX: el primer envío se aplicó pero el cliente no vio la respuesta (corte de red).
  // El reintento con la MISMA clave y el mismo cuerpo, aunque pase el tiempo y el reporte ya se haya
  // evaluado, devuelve el recibo original (200) y no pasa por la regla de duplicados (409).
  it('el reintento con la misma clave, tras una pausa y con el reporte ya procesado, devuelve el mismo recibo y no DUPLICATE_REPORT', async () => {
    const report = body();
    const created = await post(report).expect(201);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();
    const retry = await post(report).expect(200);

    expect(retry.body).toEqual(created.body);
    const saved = await db.execute(sql`select id from pricing.reports`);
    expect(saved.rows).toHaveLength(1);
  });

  // Contraparte: con una clave NUEVA el mismo precio sí es un duplicado. Si el cliente regenera la
  // clave al reintentar, ve DUPLICATE_REPORT aunque el primer envío haya llegado.
  it('el mismo cuerpo con una clave nueva responde 409 DUPLICATE_REPORT', async () => {
    const report = body();
    await post(report).expect(201);

    const response = await post(report, crypto.randomUUID()).expect(409);

    expect((response.body as { code: string }).code).toBe('DUPLICATE_REPORT');
  });

  it('la misma clave con otro cuerpo responde 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const report = body();
    await post(report).expect(201);

    const response = await post({ ...report, priceCop: 5000 }).expect(409);

    expect(response.body).toEqual({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'La clave Idempotency-Key ya se usó con otro reporte.',
    });
  });

  it.each([
    ['sin Idempotency-Key', body(), null, 'Idempotency-Key: debe ser un UUID'],
    ['con una clave que no es UUID', body(), 'clave-123', 'Idempotency-Key: debe ser un UUID'],
    [
      'con priceType combo',
      { ...body(), priceType: 'combo' },
      idempotencyKey,
      'priceType: debe ser normal u oferta',
    ],
    [
      'con el precio fuera de rango',
      { ...body(), priceCop: 0 },
      idempotencyKey,
      'priceCop: debe estar entre 1 y 10000000',
    ],
  ])('%s responde 400 VALIDATION_ERROR', async (_case, payload, key, message) => {
    const response = await post(payload, key).expect(400);

    expect(response.body).toEqual({ code: 'VALIDATION_ERROR', message });
  });

  it.each([
    [
      'una presentación que no existe',
      { presentationId: 'b9999999-9999-4999-8999-999999999999' },
      'UNKNOWN_PRESENTATION',
    ],
    [
      'una tienda que no existe',
      { establishmentId: 'b9999999-9999-4999-8999-999999999999' },
      'UNKNOWN_ESTABLISHMENT',
    ],
    [
      'un precio visto en una hora futura',
      { observedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      'INVALID_OBSERVATION_DATE',
    ],
    // Grill de la #29, pregunta 1.
    [
      'un precio visto hace más de 24 horas',
      { observedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      'INVALID_OBSERVATION_DATE',
    ],
  ])('%s responde 422 con su código y no guarda nada', async (_case, change, code) => {
    const response = await post({ ...body(), ...change }).expect(422);

    expect(response.body).toMatchObject({ code });
    const saved = await db.execute(sql`select id from pricing.reports`);
    expect(saved.rows).toHaveLength(0);
  });

  it('de punta a punta: el reporte llega por el outbox a price_current, sin datos del reportante', async () => {
    const created = await post(body()).expect(201);
    const { id } = created.body as { id: string };

    // Dos pasos del outbox: PriceReported → reliability, y PriceAssessed → comparison (#31).
    await app.get(OutboxRelay).runOnce();
    await app.get(OutboxRelay).runOnce();

    const current = await db.execute<{ report_id: string; price_cop: number }>(
      sql`select report_id, price_cop from comparison.price_current`,
    );
    expect(current.rows).toEqual([{ report_id: id, price_cop: 4500 }]);
    // EC-08 y grill de la #31, pregunta 2: PriceReported v2 lleva solo la clave seudónima del
    // reportante y el día de creación de su cuenta; nada que lo identifique o lo ubique.
    const event = await db.execute<{ version: number; payload: Record<string, unknown> }>(
      sql`select version, payload from shared.outbox where type = 'PriceReported'`,
    );
    const [reported] = event.rows;
    expect(reported?.version).toBe(2);
    expect(Object.keys(reported?.payload ?? {}).sort()).toEqual([
      'establishmentId',
      'observedAt',
      // ADR-030: precios de otras tiendas y SIPSA, sin datos de nadie.
      'plausibility',
      'presentationId',
      'priceCop',
      'priceType',
      'receivedAt',
      'reportId',
      'reporterKey',
      'reporterSince',
    ]);
    expect(reported?.payload['reporterKey']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(reported?.payload)).not.toContain(reporter.accountId);
  });

  // Grill de la #29, preguntas 2 y 3.
  describe('límites de aportes (#29)', () => {
    it('la misma presentación en la misma tienda en la misma hora responde 409 DUPLICATE_REPORT', async () => {
      const first = body();
      await post(first).expect(201);

      const response = await post({ ...first, priceCop: 4600 }, crypto.randomUUID()).expect(409);

      // Issue #84: dice desde qué hora de observación se acepta otro reporte (una hora después).
      expect(response.body).toEqual({
        code: 'DUPLICATE_REPORT',
        message: expect.stringMatching(/con una observación desde las \d{2}:\d{2}\.$/) as unknown,
        availableFrom: new Date(Date.parse(first.observedAt) + 60 * 60 * 1000).toISOString(),
      });
    });

    it('con 20 reportes en la última hora responde 429 con Retry-After y no guarda el nuevo', async () => {
      const repository = new DrizzleReportRepository(db, app.get(OutboxPublisher));
      for (let index = 0; index < 20; index += 1) {
        await repository.save(
          {
            id: crypto.randomUUID(),
            reporterId: reporter.accountId,
            presentationId,
            establishmentId: crypto.randomUUID(),
            priceCop: 4500,
            priceType: 'normal',
            observedAt: new Date(Date.now() - 40 * 60 * 1000),
            receivedAt: new Date(Date.now() - (40 - index) * 60 * 1000),
            idempotencyKey: crypto.randomUUID(),
            requestHash: 'huella-de-prueba',
          },
          [],
        );
      }

      const response = await post(body()).expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      const saved = await db.execute(sql`select id from pricing.reports`);
      expect(saved.rows).toHaveLength(20);
    });
  });
});
