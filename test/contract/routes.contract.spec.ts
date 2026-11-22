import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { contractRoutes } from '../support/contract';
import { routesOf } from '../support/routes';

// Rutas del módulo comercial que aún no se construyen (corte 3). Las ya construidas (#201 a #205)
// se vigilan como las demás.
const LATER = /^\w+ \/commerce\/promotions/;

// Grill de la #25, pregunta 2: toda ruta del código está en el contrato, y al revés.
describe('inventario de rutas frente a docs/openapi.yaml (PR-09, #25)', () => {
  let app: INestApplication;
  let inCode: string[];
  let inContract: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    inCode = routesOf(app).map((info) => info.route);
    inContract = contractRoutes();
  });

  afterAll(async () => {
    await app.close();
  });

  it('toda ruta del código está documentada en el contrato', () => {
    expect(inCode.filter((route) => !inContract.includes(route))).toEqual([]);
  });

  it('toda ruta del contrato existe en el código, salvo las comerciales pendientes', () => {
    expect(inContract.filter((route) => !LATER.test(route) && !inCode.includes(route))).toEqual([]);
  });
});
