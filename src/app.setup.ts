import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { Env } from './shared/config/env.validation';
import { ErrorFilter } from './shared/http/error.filter';
import { createValidationPipe } from './shared/http/validation';

export const API_PREFIX = 'v1';

// ADR-031: por debajo de 1 kB comprimir cuesta más CPU que lo que ahorra (y la cabecera gzip pesa).
export const COMPRESSION_THRESHOLD_BYTES = 1024;

// Configuración común de la aplicación, usada por main.ts y por las pruebas de integración.
export function configureApp(app: INestApplication): void {
  // ADR-031 (ahorro de ancho de banda): gzip o brotli según Accept-Encoding. El filtro por defecto solo
  // comprime tipos de texto (JSON), así que las fotos de /media/ y lo ya comprimido pasan intactos, y
  // agrega Vary: Accept-Encoding. Va antes de todo lo demás para cubrir también los errores.
  (app as NestExpressApplication).use(compression({ threshold: COMPRESSION_THRESHOLD_BYTES }));
  // D7 (#205): el archivo de precios oficiales llega como text/csv. 1.000 filas caben de sobra en 1 MB.
  (app as NestExpressApplication).useBodyParser('text', { type: 'text/csv', limit: '1mb' });
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
