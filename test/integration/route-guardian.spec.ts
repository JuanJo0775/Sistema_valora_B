import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { type RouteInfo, routesOf } from '../support/routes';

// RNF-010 (grill de la #33, pregunta 7): toda ruta sensible tiene control de sesión y de rol. Una
// ruta nueva que no esté en estas listas debe declarar SessionGuard y @Roles, o la prueba falla.
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /categories',
  'GET /products',
  'GET /products/:productId',
  'GET /products/:productId/comparison',
  // Grill de la #83, pregunta 7: el historial es público (RF-008 RN3).
  'GET /products/:productId/history',
  // B#120: la canasta básica de hoy es una lectura pública, como la comparación.
  'GET /featured-products',
  // #116: buscar tiendas sin ubicación es una lectura pública, como /nearby.
  'GET /establishments',
  'GET /establishments/nearby',
  // Grill de la #28: los precios de una tienda son públicos.
  'GET /establishments/:establishmentId/prices',
  'POST /auth/register',
  'POST /auth/login',
  // ADR-029: el token del correo es la credencial; no lleva sesión.
  'POST /auth/verify-email',
]);
// Con sesión, pero para cualquier rol.
const ANY_ROLE_ROUTES = new Set([
  'GET /auth/session',
  'POST /auth/logout',
  'POST /auth/resend-verification',
]);

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
