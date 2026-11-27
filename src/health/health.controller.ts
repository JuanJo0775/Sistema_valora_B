import { Controller, Get, Header } from '@nestjs/common';

// Render pone en RENDER_GIT_COMMIT el commit que sirve. Solo se repite si de verdad parece uno: la
// respuesta es pública y no debe devolver lo que haya en una variable de entorno cualquiera.
const COMMIT = /^[0-9a-f]{40}$/;

@Controller('health')
export class HealthController {
  // Liviano a propósito: sin base de datos ni dependencias, y una respuesta de pocos bytes. Render lo
  // consulta con frecuencia; no-store evita que una caché intermedia diga «ok» de un servicio caído.
  // #23: mientras Render construye la versión nueva sigue respondiendo la anterior, así que el
  // despliegue necesita saber cuál de las dos contesta.
  @Get()
  @Header('Cache-Control', 'no-store')
  check(): { status: 'ok'; commit?: string } {
    const commit = process.env['RENDER_GIT_COMMIT'] ?? '';
    return COMMIT.test(commit) ? { status: 'ok', commit: commit.slice(0, 7) } : { status: 'ok' };
  }
}
