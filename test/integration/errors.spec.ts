import { Controller, Get, type INestApplication, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { InvalidObservationDateError, InvalidTtlError } from '../../src/domain/freshness';
import {
  IncompatibleUnitsError,
  InvalidPriceError,
  InvalidQuantityError,
} from '../../src/domain/unit-price';

const domainErrors = {
  price: () => new InvalidPriceError('El precio debe ser un entero en pesos mayor o igual a $1.'),
  quantity: () => new InvalidQuantityError('La cantidad debe ser mayor que cero.'),
  units: () => new IncompatibleUnitsError('No se puede comparar 100g con 100ml.'),
  observation: () => new InvalidObservationDateError('La fecha de observación es futura.'),
  ttl: () => new InvalidTtlError('El TTL debe ser mayor que cero.'),
};

// Controlador que solo existe en esta prueba: lanza cada tipo de error para ver cómo responde la API.
@Controller('test-errors')
class ErrorsTestController {
  @Get('domain/:name')
  domain(@Param('name') name: keyof typeof domainErrors): never {
    throw domainErrors[name]();
  }
}

describe('formato de error { code, message }', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorsTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['price', 'INVALID_PRICE', 'El precio debe ser un entero en pesos mayor o igual a $1.'],
    ['quantity', 'INVALID_QUANTITY', 'La cantidad debe ser mayor que cero.'],
    ['units', 'INCOMPATIBLE_UNITS', 'No se puede comparar 100g con 100ml.'],
    ['observation', 'INVALID_OBSERVATION_DATE', 'La fecha de observación es futura.'],
    ['ttl', 'INVALID_TTL', 'El TTL debe ser mayor que cero.'],
  ])(
    'una regla del dominio incumplida (%s) responde 422 con el código %s',
    async (name, code, message) => {
      const response = await request(server).get(`/v1/test-errors/domain/${name}`).expect(422);

      expect(response.body).toEqual({ code, message });
    },
  );

  it('una ruta que no existe responde 404 con NOT_FOUND en español', async () => {
    const response = await request(server).get('/v1/no-existe').expect(404);

    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Recurso no encontrado.' });
  });
});
