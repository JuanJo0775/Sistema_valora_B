import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
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
  AlreadyAppealedError,
  AppealReport,
  InvalidAppealNoteError,
} from '../application/appeal-report';
import { ReportNotFoundError } from '../application/flag-report';
import { AppealDto } from './appeal.dto';

// Grill de la #71: lo que el autor hace con sus propios reportes. reliability solo lo conoce por su
// clave seudónima (EC-08).
@Controller()
export class MyReportsController {
  constructor(
    private readonly appealReport: AppealReport,
    private readonly identities: ReporterIdentity,
  ) {}

  @Post('reports/:reportId/appeal')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @Roles('reportante')
  async appeal(
    @Param(
      'reportId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('reportId: debe ser un UUID'),
      }),
    )
    reportId: string,
    @Body() body: AppealDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.appealReport.execute({ reportId, appellantKey: reporterKey, note: body.note });
    } catch (error) {
      if (error instanceof ReportNotFoundError) throw new NotFoundException();
      if (error instanceof AlreadyAppealedError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      // El DTO mide el texto tal cual; el caso de uso, sin los espacios de los extremos.
      if (error instanceof InvalidAppealNoteError) {
        throw new RequestValidationError(`note: ${error.message}`);
      }
      throw error;
    }
  }
}
