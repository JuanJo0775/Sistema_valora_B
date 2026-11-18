import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Liviano a propósito: sin base de datos ni dependencias, y una respuesta de 15 bytes. Render lo
  // consulta con frecuencia; no-store evita que una caché intermedia diga «ok» de un servicio caído.
  @Get()
  @Header('Cache-Control', 'no-store')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
