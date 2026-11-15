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
  method: 'get' | 'post';
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
  queue: { name: 'GET /v1/moderation/queue', method: 'get', path: '/v1/moderation/queue' },
  decision: {
    name: 'POST /v1/moderation/{itemId}/decision',
    method: 'post',
    path: `/v1/moderation/${someReport}/decision`,
    body: { decision: 'aprobar', note: 'Motivo suficiente para la prueba' },
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
  ['report', 'suspendida', 401],
  ['flag', 'sin_sesion', 401],
  ['flag', 'reportante', 'permitido'],
  ['flag', 'moderador', 403],
  ['flag', 'comercio', 403],
  ['flag', 'suspendida', 401],
  ['queue', 'sin_sesion', 401],
  ['queue', 'reportante', 403],
  ['queue', 'moderador', 'permitido'],
  ['queue', 'comercio', 403],
  ['queue', 'suspendida', 401],
  ['decision', 'sin_sesion', 401],
  ['decision', 'reportante', 403],
  ['decision', 'moderador', 'permitido'],
  ['decision', 'comercio', 403],
  ['decision', 'suspendida', 401],
  ['session', 'sin_sesion', 401],
  ['session', 'reportante', 'permitido'],
  ['session', 'moderador', 'permitido'],
  ['session', 'comercio', 'permitido'],
  ['session', 'suspendida', 401],
  ['logout', 'sin_sesion', 401],
  ['logout', 'suspendida', 401],
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
    await db.execute(sql`truncate identity.sessions, identity.accounts`);
    for (const role of ['reportante', 'moderador', 'comercio'] as const) {
      actors.set(role, await signIn(server, db, `${role}@correo.com`, role));
    }
    // Grill de la #33, pregunta 4: con la sesión todavía abierta, la cuenta suspendida no entra.
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
