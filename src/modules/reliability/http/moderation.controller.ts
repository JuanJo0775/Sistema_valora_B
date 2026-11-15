import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import {
  InvalidNoteError,
  MODERATION_DECIDER,
  type ModerationDecider,
  OwnReportError,
  ReportNotInQueueError,
} from '../application/decide-moderation';
import { ModerationQueue } from '../application/moderation-queue';
import { DecisionDto } from './decision.dto';
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
  appealNote?: string;
}

@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly queue: ModerationQueue,
    @Inject(MODERATION_DECIDER) private readonly decider: ModerationDecider,
    private readonly identities: ReporterIdentity,
  ) {}

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

  @Post(':itemId/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async decide(
    @Param(
      'itemId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('itemId: debe ser un UUID'),
      }),
    )
    itemId: string,
    @Body() body: DecisionDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    // Grill de la #32, pregunta 5: la bitácora guarda la clave seudónima de quien decide.
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.decider.execute({
        reportId: itemId,
        decision: body.decision,
        note: body.note,
        moderatorKey: reporterKey,
      });
    } catch (error) {
      if (error instanceof ReportNotInQueueError) throw new NotFoundException();
      if (error instanceof OwnReportError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      // El DTO mide el texto tal cual; el caso de uso, sin los espacios de los extremos.
      if (error instanceof InvalidNoteError) {
        throw new RequestValidationError(`note: ${error.message}`);
      }
      throw error;
    }
  }
}
