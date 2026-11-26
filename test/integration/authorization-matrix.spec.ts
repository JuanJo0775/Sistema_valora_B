import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { type SignedIn, signIn } from '../support/sign-in';

// Matriz de autorización (PR-14, RNF-010; grill de la #33, pregunta 7). La misma tabla está en
// docs/calidad/matriz-autorizacion.md. «Permitido» significa que pasa el control de sesión y rol:
// la respuesta puede ser 2xx, 400 o 404 según el cuerpo, pero nunca 401 ni 403.
type Actor = 'sin_sesion' | 'reportante' | 'moderador' | 'comercio' | 'suspendida';
type Expected = 'permitido' | 401 | 403;

interface Route {
  name: string;
  method: 'get' | 'post' | 'put';
  path: string;
  body?: object;
}

const someReport = 'f1111111-1111-4111-8111-111111111111';
const routes: Record<string, Route> = {
  report: {
    name: 'POST /v1/reports',
    method: 'post',
    path: '/v1/reports',
    body: {},
  },
  flag: {
    name: 'POST /v1/reports/{reportId}/flag',
    method: 'post',
    path: `/v1/reports/${someReport}/flag`,
    body: { reason: 'otro' },
  },
  // Grill de la #71: un reporte que no es del actor responde 404 a quien sí tiene permiso.
  appeal: {
    name: 'POST /v1/reports/{reportId}/appeal',
    method: 'post',
    path: `/v1/reports/${someReport}/appeal`,
    body: { note: 'Motivo suficiente para la prueba' },
  },
  status: {
    name: 'GET /v1/me/reports/{reportId}/status',
    method: 'get',
    path: `/v1/me/reports/${someReport}/status`,
  },
  myReports: { name: 'GET /v1/me/reports', method: 'get', path: '/v1/me/reports' },
  // Grill de la #27: propuestas de tiendas. Una propuesta que no existe responde 404 a quien sí puede.
  storeProposal: {
    name: 'POST /v1/establishment-proposals',
    method: 'post',
    path: '/v1/establishment-proposals',
    body: { name: 'Tienda de la matriz', type: 'barrio', lat: 4.5339, lng: -75.6811 },
  },
  storeProposals: {
    name: 'GET /v1/moderation/store-proposals',
    method: 'get',
    path: '/v1/moderation/store-proposals',
  },
  storeProposalDecision: {
    name: 'POST /v1/moderation/store-proposals/{proposalId}/decision',
    method: 'post',
    path: `/v1/moderation/store-proposals/${someReport}/decision`,
    body: { decision: 'rechazar', note: 'Motivo suficiente para la prueba' },
  },
  // Grill de la #26: propuestas de productos. Una propuesta que no existe responde 404 a quien sí puede.
  productRequest: {
    name: 'POST /v1/product-requests',
    method: 'post',
    path: '/v1/product-requests',
    body: {},
  },
  productRequests: {
    name: 'GET /v1/moderation/product-requests',
    method: 'get',
    path: '/v1/moderation/product-requests',
  },
  productRequestDecision: {
    name: 'POST /v1/moderation/product-requests/{requestId}/decision',
    method: 'post',
    path: `/v1/moderation/product-requests/${someReport}/decision`,
    body: { decision: 'rechazar', note: 'Motivo suficiente para la prueba' },
  },
  // ADR-020 (#88): sin archivo, a quien sí puede le responde 400.
  productImage: {
    name: 'PUT /v1/moderation/products/{productId}/image',
    method: 'put',
    path: `/v1/moderation/products/${someReport}/image`,
  },
  queue: { name: 'GET /v1/moderation/queue', method: 'get', path: '/v1/moderation/queue' },
  // #257: el contador de la campana y de las pestañas de moderación.
  moderationSummary: {
    name: 'GET /v1/moderation/summary',
    method: 'get',
    path: '/v1/moderation/summary',
  },
  decision: {
    name: 'POST /v1/moderation/{itemId}/decision',
    method: 'post',
    path: `/v1/moderation/${someReport}/decision`,
    body: { decision: 'aprobar', note: 'Motivo suficiente para la prueba' },
  },
  // Grill de la #73: un correo que no existe responde 404 a quien sí tiene permiso.
  roles: {
    name: 'POST /v1/moderation/roles',
    method: 'post',
    path: '/v1/moderation/roles',
    body: {
      email: 'nadie@correo.com',
      role: 'moderador',
      note: 'Motivo suficiente para la prueba',
    },
  },
  session: { name: 'GET /v1/auth/session', method: 'get', path: '/v1/auth/session' },
  logout: { name: 'POST /v1/auth/logout', method: 'post', path: '/v1/auth/logout' },
};

// Cerrar sesión revoca la sesión del actor: sus filas van al final.
const matrix: [keyof typeof routes, Actor, Expected][] = [
  ['report', 'sin_sesion', 401],
  ['report', 'reportante', 'permitido'],
  ['report', 'moderador', 403],
  ['report', 'comercio', 403],
  ['report', 'suspendida', 403],
  ['flag', 'sin_sesion', 401],
  ['flag', 'reportante', 'permitido'],
  ['flag', 'moderador', 403],
  ['flag', 'comercio', 403],
  ['flag', 'suspendida', 403],
  ['appeal', 'sin_sesion', 401],
  ['appeal', 'reportante', 'permitido'],
  ['appeal', 'moderador', 403],
  ['appeal', 'comercio', 403],
  ['appeal', 'suspendida', 'permitido'],
  ['status', 'sin_sesion', 401],
  ['status', 'reportante', 'permitido'],
  ['status', 'moderador', 403],
  ['status', 'comercio', 403],
  ['status', 'suspendida', 'permitido'],
  ['myReports', 'sin_sesion', 401],
  ['myReports', 'reportante', 'permitido'],
  ['myReports', 'moderador', 403],
  ['myReports', 'comercio', 403],
  ['myReports', 'suspendida', 'permitido'],
  ['storeProposal', 'sin_sesion', 401],
  ['storeProposal', 'reportante', 'permitido'],
  ['storeProposal', 'moderador', 403],
  ['storeProposal', 'comercio', 403],
  ['storeProposal', 'suspendida', 403],
  ['storeProposals', 'sin_sesion', 401],
  ['storeProposals', 'reportante', 403],
  ['storeProposals', 'moderador', 'permitido'],
  ['storeProposals', 'comercio', 403],
  ['storeProposals', 'suspendida', 403],
  ['storeProposalDecision', 'sin_sesion', 401],
  ['storeProposalDecision', 'reportante', 403],
  ['storeProposalDecision', 'moderador', 'permitido'],
  ['storeProposalDecision', 'comercio', 403],
  ['storeProposalDecision', 'suspendida', 403],
  ['productRequest', 'sin_sesion', 401],
  ['productRequest', 'reportante', 'permitido'],
  ['productRequest', 'moderador', 403],
  ['productRequest', 'comercio', 403],
  ['productRequest', 'suspendida', 403],
  ['productRequests', 'sin_sesion', 401],
  ['productRequests', 'reportante', 403],
  ['productRequests', 'moderador', 'permitido'],
  ['productRequests', 'comercio', 403],
  ['productRequests', 'suspendida', 403],
  ['productRequestDecision', 'sin_sesion', 401],
  ['productRequestDecision', 'reportante', 403],
  ['productRequestDecision', 'moderador', 'permitido'],
  ['productRequestDecision', 'comercio', 403],
  ['productRequestDecision', 'suspendida', 403],
  ['productImage', 'sin_sesion', 401],
  ['productImage', 'reportante', 403],
  ['productImage', 'moderador', 'permitido'],
  ['productImage', 'comercio', 403],
  ['productImage', 'suspendida', 403],
  ['queue', 'sin_sesion', 401],
  ['queue', 'reportante', 403],
  ['queue', 'moderador', 'permitido'],
  ['queue', 'comercio', 403],
  ['queue', 'suspendida', 403],
  ['moderationSummary', 'sin_sesion', 401],
  ['moderationSummary', 'reportante', 403],
  ['moderationSummary', 'moderador', 'permitido'],
  ['moderationSummary', 'comercio', 403],
  ['moderationSummary', 'suspendida', 403],
  ['decision', 'sin_sesion', 401],
  ['decision', 'reportante', 403],
  ['decision', 'moderador', 'permitido'],
  ['decision', 'comercio', 403],
  ['decision', 'suspendida', 403],
  ['roles', 'sin_sesion', 401],
  ['roles', 'reportante', 403],
  ['roles', 'moderador', 'permitido'],
  ['roles', 'comercio', 403],
  ['roles', 'suspendida', 403],
  ['session', 'sin_sesion', 401],
  ['session', 'reportante', 'permitido'],
  ['session', 'moderador', 'permitido'],
  ['session', 'comercio', 'permitido'],
  ['session', 'suspendida', 'permitido'],
  ['logout', 'sin_sesion', 401],
  ['logout', 'suspendida', 'permitido'],
  ['logout', 'reportante', 'permitido'],
  ['logout', 'moderador', 'permitido'],
  ['logout', 'comercio', 'permitido'],
];

describe('matriz de autorización por rol (PR-14)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const actors = new Map<Actor, SignedIn>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    const db = app.get<Database>(DATABASE);
    await db.execute(
      sql`truncate identity.email_verifications, identity.password_resets, identity.sessions, identity.accounts`,
    );
    for (const role of ['reportante', 'moderador', 'comercio'] as const) {
      actors.set(role, await signIn(server, db, `${role}@correo.com`, role));
    }
    // Grill de la #71, pregunta 5: la cuenta suspendida tiene una sesión limitada: ve el estado de sus
    // reportes, apela y cierra sesión; lo demás responde 403 ACCOUNT_SUSPENDED.
    const suspended = await signIn(server, db, 'suspendida@correo.com');
    await db.execute(
      sql`update identity.accounts set suspended_until = '2099-01-01T00:00:00Z' where email = 'suspendida@correo.com'`,
    );
    actors.set('suspendida', suspended);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cubre al menos 20 casos (PR-14)', () => {
    expect(matrix.length).toBeGreaterThanOrEqual(20);
  });

  it.each(matrix)('%s con %s → %s', async (routeKey, actor, expected) => {
    const route = routes[routeKey];
    if (!route) throw new Error(`Ruta desconocida: ${routeKey}`);
    let call = request(server)[route.method](route.path);
    const signedIn = actors.get(actor);
    if (signedIn)
      call = call.set('Cookie', signedIn.cookie).set('X-CSRF-Token', signedIn.csrfToken);
    if (route.body) call = call.send(route.body);

    const response = await call;

    const outcome =
      response.status === 401 || response.status === 403 ? response.status : 'permitido';
    expect(outcome).toBe(expected);
  });
});
