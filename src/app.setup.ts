import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './shared/config/env.validation';
import { ErrorFilter } from './shared/http/error.filter';
import { createValidationPipe } from './shared/http/validation';

export const API_PREFIX = 'v1';

// Configuración común de la aplicación, usada por main.ts y por las pruebas de integración.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ErrorFilter(app.get(HttpAdapterHost)));
  // ADR-020 (#88): las fotos se sirven en solo lectura hasta decidir el proveedor (ADR-012). El
  // nombre cambia si cambia la foto, así que se guardan en caché por un año.
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // ADR-012: detrás de Vercel y Render, request.ip sería la IP del proxy y los límites por IP (#16)
  // bloquearían a todos a la vez. Con 0 saltos no se cree en X-Forwarded-For.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  (app as NestExpressApplication).set('trust proxy', trustProxy);
  (app as NestExpressApplication).useStaticAssets(config.get('MEDIA_DIR', { infer: true }), {
    prefix: '/media/',
    index: false,
    dotfiles: 'deny',
    immutable: true,
    maxAge: '365d',
  });
}
