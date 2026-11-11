import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'v1';

// Configuración común de la aplicación, usada por main.ts y por las pruebas de integración.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
}
