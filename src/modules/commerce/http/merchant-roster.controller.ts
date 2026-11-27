import {
  Body,
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
import { IsString, Length } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import { MerchantNotVerifiedError, RevokeMerchant } from '../application/revoke-merchant';
import { VerifiedMerchants } from '../application/verified-merchants';

const NOTE_MESSAGE = 'debe tener de 10 a 500 caracteres';

export class MerchantRevocationDto {
  @IsString({ message: NOTE_MESSAGE })
  @Length(10, 500, { message: NOTE_MESSAGE })
  note!: string;
}

interface VerifiedMerchantsResponse {
  items: {
    establishment: { id: string; name: string };
    responsibleName: string;
    nit: string | null;
    phone: string;
    verifiedAt: string | null;
  }[];
  total: number;
}

// H14: moderación ve los comercios verificados y puede revocar uno por iniciativa propia, sin esperar
// una denuncia o una disputa. Nunca la cuenta del comercio (EC-08).
@Controller('moderation/merchants')
export class MerchantRosterController {
  constructor(
    private readonly merchants: VerifiedMerchants,
    private readonly revokeMerchant: RevokeMerchant,
    private readonly identities: ReporterIdentity,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async list(): Promise<VerifiedMerchantsResponse> {
    const { items, total } = await this.merchants.execute();
    return {
      total,
      items: items.map(({ verifiedAt, ...item }) => ({
        ...item,
        verifiedAt: verifiedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post(':establishmentId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async revoke(
    @Param(
      'establishmentId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('establishmentId: debe ser un UUID'),
      }),
    )
    establishmentId: string,
    @Body() body: MerchantRevocationDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.revokeMerchant.execute({
        establishmentId,
        note: body.note.trim(),
        moderatorKey: reporterKey,
      });
    } catch (error) {
      if (error instanceof MerchantNotVerifiedError) throw new NotFoundException();
      throw error;
    }
  }
}
