import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ImportEstablishments } from '../../src/modules/establishments';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { OutboxRelay } from '../../src/shared/events';
import { contractErrors } from '../support/contract';
import { type SignedIn, signIn } from '../support/sign-in';

// Datos de prueba: solo existen dentro de esta prueba.
const storeId = 'c9555555-5555-4555-8555-555555555555';
const neighborId = 'c9555555-5555-4555-8555-666666666666';
const STORE = { lat: 4.5339, lng: -75.6811 };
const day = { opens: '07:00', closes: '20:00' };
const openingHours = {
  lunes: day,
  martes: day,
  miercoles: day,
  jueves: day,
  viernes: day,
  sabado: day,
  domingo: null,
};

// D5 del grill comercial (#207), de punta a punta: commerce → establishments → moderador.
describe('datos de la tienda por HTTP (#207)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let db: Database;
  let merchant: SignedIn;
  let moderator: SignedIn;
  let reporter: SignedIn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.role_changes, identity.accounts, commerce.merchant_claims, shared.outbox, shared.processed_events, establishments.establishments, establishments.store_proposals, establishments.store_corrections`,
    );
    const stores = app.get(ImportEstablishments);
    await stores.save({ id: storeId, name: 'Tienda La Esperanza', type: 'barrio', ...STORE });
    // Unos 30 m al norte.
    await stores.save({
      id: neighborId,
      name: 'Minimercado El Sol',
      type: 'minimercado',
      lat: STORE.lat + 0.00027,
      lng: STORE.lng,
    });
    merchant = await signIn(server, db, 'comercio-datos@correo.com');
    await request(server)
      .post('/v1/commerce/claims')
      .set('Cookie', merchant.cookie)
      .set('X-CSRF-Token', merchant.csrfToken)
      .send({
        establishmentId: storeId,
        responsibleName: 'Rosa Gómez',
        phone: '3001234567',
        acceptedTermsVersion: '2026-11',
        location: { lat: STORE.lat + 0.00018, lng: STORE.lng },
      })
      .expect(201);
    await app.get(OutboxRelay).runOnce();
    moderator = await signIn(server, db, 'moderadora-datos@correo.com', 'moderador');
    reporter = await signIn(server, db, 'reportante-datos@correo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  const patch = (as: SignedIn | null, body: object) => {
    const call = request(server).patch('/v1/commerce/establishment').send(body);
    return as ? call.set('Cookie', as.cookie).set('X-CSRF-Token', as.csrfToken) : call;
  };
  const storePage = () => request(server).get(`/v1/establishments/${storeId}/prices`);

  it('200: horario y teléfono al instante; la ficha pública los muestra', async () => {
    const response = await patch(merchant, { openingHours, phone: '6067441234' }).expect(200);

    expect(response.body).toEqual({ applied: ['openingHours', 'phone'], inReview: [] });
    const page = await storePage().expect(200);
    expect((page.body as { establishment: object }).establishment).toMatchObject({
      openingHours,
      phone: '6067441234',
    });
    expect([
      ...contractErrors('PATCH /commerce/establishment', 200, response.body as unknown),
      ...contractErrors('GET /establishments/:establishmentId/prices', 200, page.body as unknown),
    ]).toEqual([]);
  });

  it('el nombre de la vecina y la ubicación van a la cola del moderador; al aprobar se aplican', async () => {
    const response = await patch(merchant, {
      name: 'Tienda El Sol',
      location: { lat: 4.534, lng: -75.6812 },
    }).expect(200);

    expect(response.body).toEqual({ applied: [], inReview: ['name', 'location'] });
    const queue = await request(server)
      .get('/v1/moderation/store-proposals')
      .set('Cookie', moderator.cookie)
      .expect(200);
    const items = (queue.body as { items: { kind: string; id: string }[] }).items;
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'correccion',
        establishmentId: storeId,
        current: { name: 'Tienda La Esperanza', lat: STORE.lat, lng: STORE.lng },
        proposed: { name: 'Tienda El Sol', lat: 4.534, lng: -75.6812 },
      }),
    ]);
    expect(contractErrors('GET /moderation/store-proposals', 200, queue.body as unknown)).toEqual(
      [],
    );

    await request(server)
      .post(`/v1/moderation/store-proposals/${items[0]?.id ?? ''}/decision`)
      .set('Cookie', moderator.cookie)
      .set('X-CSRF-Token', moderator.csrfToken)
      .send({ decision: 'aprobar', note: 'Verificada con la foto de la fachada' })
      .expect(204);

    const page = await storePage().expect(200);
    expect((page.body as { establishment: object }).establishment).toMatchObject({
      name: 'Tienda El Sol',
      lat: 4.534,
      lng: -75.6812,
    });
  });

  it('422 con un horario inválido; 400 con datos inválidos; 401 sin sesión; 403 un reportante', async () => {
    const responses = await Promise.all([
      patch(merchant, {
        openingHours: { ...openingHours, lunes: { opens: '20:00', closes: '07:00' } },
      }),
      patch(merchant, { phone: '123' }),
      patch(null, { phone: '6067441234' }),
      patch(reporter, { phone: '6067441234' }),
    ]);

    expect(responses.map((r) => [r.status, (r.body as { code?: string }).code])).toEqual([
      [422, 'INVALID_OPENING_HOURS'],
      [400, 'VALIDATION_ERROR'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
    ]);
  });
});
