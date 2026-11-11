import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorFilter } from './shared/http/error.filter';
import { createValidationPipe } from './shared/http/validation';

export const API_PREFIX = 'v1';

// Configuración común de la aplicación, usada por main.ts y por las pruebas de integración.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ErrorFilter(app.get(HttpAdapterHost)));
}
