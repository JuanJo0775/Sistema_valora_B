import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthenticatedSession,
  CurrentSession,
  Roles,
  SessionGuard,
  VerifiedEmailGuard,
} from '../../identity';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  AccountHasEstablishmentError,
  ClaimEstablishment,
  type ClaimResult,
  EstablishmentHasOwnerError,
  EstablishmentNotFoundError,
  InvalidNitError,
} from '../application/claim-establishment';
import { MerchantProfile, type MerchantProfileView } from '../application/merchant-profile';
import { ClaimEstablishmentDto } from './merchant.dto';

// RF-015 con las D2 y D3 del grill comercial (#201).
@Controller('commerce')
export class MerchantController {
  constructor(
    private readonly claimEstablishment: ClaimEstablishment,
    private readonly merchantProfile: MerchantProfile,
  ) {}

  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VerifiedEmailGuard)
  @Roles('reportante')
  // NOT_AT_ESTABLISHMENT es un DomainError: el filtro de errores responde 422.
  async claim(
    @Body() body: ClaimEstablishmentDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<ClaimResult> {
    try {
      return await this.claimEstablishment.execute({
        accountId: session.accountId,
        establishmentId: body.establishmentId,
        responsibleName: body.responsibleName,
        ...(body.nit === undefined ? {} : { nit: body.nit }),
        phone: body.phone,
        acceptedTermsVersion: body.acceptedTermsVersion,
        location: { lat: body.location.lat, lng: body.location.lng },
      });
    } catch (error) {
      if (error instanceof InvalidNitError) {
        throw new RequestValidationError(`nit: ${error.message}`);
      }
      if (error instanceof EstablishmentNotFoundError) throw new NotFoundException();
      if (
        error instanceof EstablishmentHasOwnerError ||
        error instanceof AccountHasEstablishmentError
      ) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  // Dato de la propia cuenta: nunca en una caché compartida.
  // El reportante sin tienda recibe 404; en B2 lo usa la cuenta pre-aprobada.
  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('reportante', 'comercio')
  async me(@CurrentSession() session: AuthenticatedSession): Promise<MerchantProfileView> {
    const profile = await this.merchantProfile.find(session.accountId);
    if (!profile) throw new NotFoundException();
    return profile;
  }
}
