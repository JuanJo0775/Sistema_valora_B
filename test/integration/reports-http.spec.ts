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
    // Intervalo muy largo: el repartidor del outbox se llama a mano con runOnce().
    process.env['OUTBOX_POLL_INTERVAL_MS'] = '3600000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    // Una sola cuenta de reportante para todo el archivo: los límites de inicio de sesión cuentan
    // por IP.
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    reporter = await signIn(server, db, 'reportante@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate pricing.reports, comparison.price_current, shared.outbox, shared.processed_events, catalog.presentations, catalog.products, establishments.establishments`,
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
  ])('%s responde 422 con su código y no guarda nada', async (_case, change, code) => {
    const response = await post({ ...body(), ...change }).expect(422);

    expect(response.body).toMatchObject({ code });
    const saved = await db.execute(sql`select id from pricing.reports`);
    expect(saved.rows).toHaveLength(0);
  });

  it('de punta a punta: el reporte llega por el outbox a price_current, sin datos del reportante', async () => {
    const created = await post(body()).expect(201);
    const { id } = created.body as { id: string };

    await app.get(OutboxRelay).runOnce();

    const current = await db.execute<{ report_id: string; price_cop: number }>(
      sql`select report_id, price_cop from comparison.price_current`,
    );
    expect(current.rows).toEqual([{ report_id: id, price_cop: 4500 }]);
    // EC-08: el evento no lleva nada que identifique o ubique al reportante.
    const event = await db.execute<{ payload: Record<string, unknown> }>(
      sql`select payload from shared.outbox`,
    );
    expect(Object.keys(event.rows[0]?.payload ?? {}).sort()).toEqual([
      'establishmentId',
      'observedAt',
      'presentationId',
      'priceCop',
      'priceType',
      'receivedAt',
      'reportId',
    ]);
  });
});
