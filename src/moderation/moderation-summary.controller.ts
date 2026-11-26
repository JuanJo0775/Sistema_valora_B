import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Roles, SessionGuard } from '../modules/identity';
import { ModerationSummary, type PendingByQueue } from './moderation-summary';

// #257: el contador de la campana y de las pestañas del panel. Solo del moderador.
@Controller('moderation')
export class ModerationSummaryController {
  constructor(private readonly summary: ModerationSummary) {}

  // Dato de la cuenta del moderador y siempre al día: nunca en una caché compartida.
  @Get('summary')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('moderador')
  list(): Promise<PendingByQueue> {
    return this.summary.execute();
  }
}
