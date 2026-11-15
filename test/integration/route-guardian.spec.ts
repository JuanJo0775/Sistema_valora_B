import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { SessionGuard } from '../../src/modules/identity';

// RNF-010 (grill de la #33, pregunta 7): toda ruta sensible tiene control de sesión y de rol. Una
// ruta nueva que no esté en estas listas debe declarar SessionGuard y @Roles, o la prueba falla.
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /products',
  'GET /products/:productId',
  'GET /products/:productId/comparison',
  // Grill de la #83, pregunta 7: el historial es público (RF-008 RN3).
  'GET /products/:productId/history',
  'GET /establishments/nearby',
  // Grill de la #28: los precios de una tienda son públicos.
  'GET /establishments/:establishmentId/prices',
  'POST /auth/register',
  'POST /auth/login',
]);
// Con sesión, pero para cualquier rol.
const ANY_ROLE_ROUTES = new Set(['GET /auth/session', 'POST /auth/logout']);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
// Clave con la que @Roles guarda los roles (identity/http/session.guard.ts).
const ROLES_KEY = 'identity.roles';

interface RouteInfo {
  route: string;
  guarded: boolean;
  roles: unknown;
}

const joinPath = (...parts: string[]) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;

function routesOf(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
      const classGuards =
        (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? [];
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || path === undefined) continue;
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
        ];
        routes.push({
          route: `${HTTP_METHODS[method] ?? String(method)} ${joinPath(base, path)}`,
          guarded: guards.includes(SessionGuard),
          roles: Reflect.getMetadata(ROLES_KEY, handler),
        });
      }
    }
  }
  return routes;
}

describe('guardián de rutas (RNF-010)', () => {
  let app: INestApplication;
  let routes: RouteInfo[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    routes = routesOf(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('encuentra las rutas públicas declaradas: la lista no tiene rutas que ya no existen', () => {
    const found = new Set(routes.map((info) => info.route));

    expect([...PUBLIC_ROUTES, ...ANY_ROLE_ROUTES].filter((route) => !found.has(route))).toEqual([]);
  });

  it('toda ruta que no es pública exige sesión', () => {
    const open = routes.filter((info) => !PUBLIC_ROUTES.has(info.route) && !info.guarded);

    expect(open.map((info) => info.route)).toEqual([]);
  });

  it('toda ruta con sesión, salvo las de cualquier rol, declara los roles permitidos', () => {
    const withoutRoles = routes.filter(
      (info) =>
        !PUBLIC_ROUTES.has(info.route) &&
        !ANY_ROLE_ROUTES.has(info.route) &&
        (!Array.isArray(info.roles) || info.roles.length === 0),
    );

    expect(withoutRoles.map((info) => info.route)).toEqual([]);
  });
});
