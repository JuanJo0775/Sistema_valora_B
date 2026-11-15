import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Roles, SessionGuard } from '../../identity';
import { ModerationQueue } from '../application/moderation-queue';
import { QueueQueryDto } from './queue.query';

// Esquema ModerationItem del contrato: nunca quién reportó ni quién marcó (EC-08).
interface ModerationItemResponse {
  id: string;
  reason: string;
  productName: string;
  establishmentName: string;
  reportedPriceCop: number;
  medianPriceCop?: number;
  deviationPercent?: number;
  reportersCount: number;
  createdAt: string;
}

@Controller('moderation')
export class ModerationController {
  constructor(private readonly queue: ModerationQueue) {}

  @Get('queue')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  // RF-013: la cola es solo del moderador.
  @Roles('moderador')
  async list(@Query() query: QueueQueryDto): Promise<{ items: ModerationItemResponse[] }> {
    const items = await this.queue.list({
      ...(query.reason === undefined ? {} : { reason: query.reason }),
      limit: query.limit,
    });
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }
}
