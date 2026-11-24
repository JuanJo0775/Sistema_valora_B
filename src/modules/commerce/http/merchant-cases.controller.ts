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
import { IsIn, IsString, Length } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import { DecideMerchantCase, MerchantCaseNotFoundError } from '../application/decide-merchant-case';
import { type MerchantCaseItem, MerchantCasesQueue } from '../application/merchant-cases-queue';
import {
  MerchantNotFoundError,
  MerchantReportOpenError,
  ReportMerchant,
} from '../application/report-merchant';

const NOTE_MESSAGE = 'debe tener de 10 a 500 caracteres';

export class MerchantReportDto {
  @IsString({ message: NOTE_MESSAGE })
  @Length(10, 500, { message: NOTE_MESSAGE })
  reason!: string;
}

export class MerchantCaseDecisionDto {
  @IsIn(['revocar', 'descartar', 'aprobar', 'rechazar'], {
    message: 'debe ser revocar, descartar, aprobar o rechazar',
  })
  decision!: 'revocar' | 'descartar' | 'aprobar' | 'rechazar';

  @IsString({ message: NOTE_MESSAGE })
  @Length(10, 500, { message: NOTE_MESSAGE })
  note!: string;
}

const uuidOf = (name: string) =>
  new ParseUUIDPipe({
    exceptionFactory: () => new RequestValidationError(`${name}: debe ser un UUID`),
  });

type MerchantCaseResponse = Omit<MerchantCaseItem, 'createdAt' | 'owner'> & {
  owner:
    | (Omit<NonNullable<MerchantCaseItem['owner']>, 'verifiedAt'> & {
        verifiedAt: string | null;
      })
    | null;
  createdAt: string;
};

// D2 y D3 del grill comercial (#208): denuncias, disputas y la decisión del moderador. Las claves que
// se guardan son seudónimas (EC-08). OWN_ESTABLISHMENT es un DomainError: el filtro responde 422.
@Controller()
export class MerchantCasesController {
  constructor(
    private readonly reportMerchant: ReportMerchant,
    private readonly queue: MerchantCasesQueue,
    private readonly decideCase: DecideMerchantCase,
    private readonly identities: ReporterIdentity,
  ) {}

  @Get('establishments/:establishmentId/merchant-reports')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('reportante', 'comercio')
  async eligibility(
    @Param('establishmentId', uuidOf('establishmentId')) establishmentId: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ canReport: boolean }> {
    return { canReport: await this.reportMerchant.canReport(establishmentId, session.accountId) };
  }

  @Post('establishments/:establishmentId/merchant-reports')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @Roles('reportante', 'comercio')
  async report(
    @Param('establishmentId', uuidOf('establishmentId')) establishmentId: string,
    @Body() body: MerchantReportDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ id: string; status: 'pendiente' }> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      return await this.reportMerchant.execute({
        establishmentId,
        accountId: session.accountId,
        reporterKey,
        reason: body.reason,
      });
    } catch (error) {
      if (error instanceof MerchantNotFoundError) throw new NotFoundException();
      if (error instanceof MerchantReportOpenError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Get('moderation/merchant-cases')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async list(): Promise<{ items: MerchantCaseResponse[] }> {
    const items = await this.queue.list();
    return {
      items: items.map(({ owner, createdAt, ...item }) => ({
        ...item,
        owner: owner && { ...owner, verifiedAt: owner.verifiedAt?.toISOString() ?? null },
        createdAt: createdAt.toISOString(),
      })),
    };
  }

  @Post('moderation/merchant-cases/:caseId/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async decide(
    @Param('caseId', uuidOf('caseId')) caseId: string,
    @Body() body: MerchantCaseDecisionDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.decideCase.execute({
        caseId,
        decision: body.decision,
        note: body.note.trim(),
        moderatorKey: reporterKey,
      });
    } catch (error) {
      if (error instanceof MerchantCaseNotFoundError) throw new NotFoundException();
      throw error;
    }
  }
}
