import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
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
import { ReportStatus, type ReportState } from '../application/report-status';
import { AppealDto } from './appeal.dto';

// Grill de la #71: lo que el autor hace con sus propios reportes. reliability solo lo conoce por su
// clave seudónima (EC-08).
@Controller()
export class MyReportsController {
  constructor(
    private readonly appealReport: AppealReport,
    private readonly reportStatus: ReportStatus,
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

  // no-store: el estado es privado del autor y cambia con cada decisión.
  @Get('me/reports/:reportId/status')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('reportante')
  async status(
    @Param(
      'reportId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('reportId: debe ser un UUID'),
      }),
    )
    reportId: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ reportId: string; status: ReportState; appealableUntil?: string }> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      const view = await this.reportStatus.of(reportId, reporterKey);
      return {
        reportId: view.reportId,
        status: view.status,
        ...(view.appealableUntil ? { appealableUntil: view.appealableUntil.toISOString() } : {}),
      };
    } catch (error) {
      if (error instanceof ReportNotFoundError) throw new NotFoundException();
      throw error;
    }
  }
}
