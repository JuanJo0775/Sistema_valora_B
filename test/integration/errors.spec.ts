import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  type INestApplication,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsInt, IsPositive } from 'class-validator';
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

const httpErrors = {
  unauthorized: () => new UnauthorizedException(),
  forbidden: () => new ForbiddenException(),
  conflict: () => new ConflictException(),
  'conflict-with-message': () =>
    new ConflictException('Ya registraste este precio hace menos de una hora.'),
  'too-many': () => new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
};

// DTO que solo existe en esta prueba, con mensajes en español como los tendrán los DTOs reales.
class TestReportDto {
  @IsInt({ message: 'debe ser un número entero' })
  priceCop!: number;

  @IsPositive({ message: 'debe ser mayor que 0' })
  quantity!: number;
}

// Controlador que solo existe en esta prueba: lanza cada tipo de error para ver cómo responde la API.
@Controller('test-errors')
class ErrorsTestController {
  @Get('domain/:name')
  domain(@Param('name') name: keyof typeof domainErrors): never {
    throw domainErrors[name]();
  }

  @Get('http/:name')
  http(@Param('name') name: keyof typeof httpErrors): never {
    throw httpErrors[name]();
  }

  @Get('unexpected')
  unexpected(): never {
    throw new TypeError('detalle interno: falló la consulta a pricing.price_reports');
  }

  @Post('validation')
  validation(@Body() body: TestReportDto): TestReportDto {
    return body;
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

  it.each([
    ['unauthorized', 401, 'UNAUTHORIZED', 'Se requiere sesión.'],
    ['forbidden', 403, 'FORBIDDEN', 'El rol no tiene permiso.'],
    ['conflict', 409, 'CONFLICT', 'Conflicto con el estado actual.'],
    [
      'conflict-with-message',
      409,
      'CONFLICT',
      'Ya registraste este precio hace menos de una hora.',
    ],
    ['too-many', 429, 'TOO_MANY_REQUESTS', 'Límite de frecuencia superado.'],
  ])('el error HTTP %s responde %i con %s en español', async (name, status, code, message) => {
    const response = await request(server).get(`/v1/test-errors/http/${name}`).expect(status);

    expect(response.body).toEqual({ code, message });
  });

  it('un cuerpo con dos campos inválidos responde 400 con los dos errores juntos', async () => {
    const response = await request(server)
      .post('/v1/test-errors/validation')
      .send({ priceCop: 'abc', quantity: 0 })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'priceCop: debe ser un número entero; quantity: debe ser mayor que 0',
    });
  });

  it('un campo que el endpoint no declara se rechaza con 400', async () => {
    const response = await request(server)
      .post('/v1/test-errors/validation')
      .send({ priceCop: 4000, quantity: 1, reporterLocation: '4.53,-75.68' })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'reporterLocation: no está permitido',
    });
  });

  it('un cuerpo que no es JSON válido responde 400 VALIDATION_ERROR', async () => {
    const response = await request(server)
      .post('/v1/test-errors/validation')
      .set('Content-Type', 'application/json')
      .send('{"priceCop": 4000,')
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'El cuerpo de la solicitud no es JSON válido.',
    });
  });

  it('un error inesperado responde 500 genérico sin filtrar detalles internos', async () => {
    const response = await request(server).get('/v1/test-errors/unexpected').expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
    });
    expect(JSON.stringify(response.body)).not.toContain('price_reports');
  });
});
