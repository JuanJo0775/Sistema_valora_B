import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
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
  AlreadyFlaggedError,
  REPORT_FLAGGER,
  type ReportFlagger,
  ReportNotFoundError,
} from '../application/flag-report';
import { FlagDto } from './flag.dto';

// Grill de la #32: la ruta cuelga de /reports, pero las marcas son de reliability.
@Controller('reports')
export class FlagsController {
  constructor(
    @Inject(REPORT_FLAGGER) private readonly flagReport: ReportFlagger,
    private readonly reporters: ReporterIdentity,
  ) {}

  @Post(':reportId/flag')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  // Grill de la #32, pregunta 7: solo el reportante marca.
  @Roles('reportante')
  async flag(
    @Param(
      'reportId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('reportId: debe ser un UUID'),
      }),
    )
    reportId: string,
    @Body() body: FlagDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    // EC-08: reliability solo conoce la clave seudónima de quien marca.
    const { reporterKey } = await this.reporters.of(session.accountId);
    try {
      await this.flagReport.execute({
        reportId,
        flaggerKey: reporterKey,
        reason: body.reason,
        ...(body.comment === undefined ? {} : { comment: body.comment }),
      });
    } catch (error) {
      if (error instanceof ReportNotFoundError) throw new NotFoundException();
      if (error instanceof AlreadyFlaggedError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }
}
