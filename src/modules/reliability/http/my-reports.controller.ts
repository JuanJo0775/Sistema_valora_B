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
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  AllowSuspended,
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
import { MyReports } from '../application/my-reports';
import { ReportStatus, type ReportState } from '../application/report-status';
import { AppealDto } from './appeal.dto';
import { MyReportsQueryDto } from './my-reports.query';

// Grill de la #76, pregunta 2: la forma de GET /v1/me/reports en el contrato.
interface MyReportsResponse {
  items: {
    reportId: string;
    productName: string;
    establishmentName: string;
    priceCop: number;
    priceType: string;
    observedAt: string;
    status: ReportState;
    appealableUntil?: string;
  }[];
  nextBefore?: string;
}

// Grill de la #71: lo que el autor hace con sus propios reportes. reliability solo lo conoce por su
// clave seudónima (EC-08).
@Controller()
export class MyReportsController {
  constructor(
    private readonly appealReport: AppealReport,
    private readonly reportStatus: ReportStatus,
    private readonly myReports: MyReports,
    private readonly identities: ReporterIdentity,
  ) {}

  @Post('reports/:reportId/appeal')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @Roles('reportante')
  // Grill de la #71, pregunta 5: una cuenta suspendida puede apelar el descarte que la suspendió.
  @AllowSuspended()
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
  @AllowSuspended()
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

  // Grill de la #76: la lista de aportes, el más reciente primero; privada y sin caché.
  @Get('me/reports')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('reportante')
  @AllowSuspended()
  async list(
    @Query() query: MyReportsQueryDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<MyReportsResponse> {
    const { reporterKey } = await this.identities.of(session.accountId);
    const page = await this.myReports.list(reporterKey, {
      limit: query.limit,
      ...(query.before ? { before: query.before } : {}),
    });
    return {
      items: page.items.map(({ observedAt, appealableUntil, ...item }) => ({
        ...item,
        observedAt: observedAt.toISOString(),
        ...(appealableUntil ? { appealableUntil: appealableUntil.toISOString() } : {}),
      })),
      ...(page.nextBefore ? { nextBefore: page.nextBefore.toISOString() } : {}),
    };
  }
}
