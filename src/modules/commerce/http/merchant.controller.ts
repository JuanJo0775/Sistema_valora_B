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
import {
  ClaimProposedEstablishment,
  type ProposedClaimResult,
} from '../application/claim-proposed-establishment';
import { MerchantProfile, type MerchantProfileView } from '../application/merchant-profile';
import { ClaimEstablishmentDto } from './merchant.dto';

// RF-015 con las D2 y D3 del grill comercial (#201, #202).
@Controller('commerce')
export class MerchantController {
  constructor(
    private readonly claimEstablishment: ClaimEstablishment,
    private readonly claimProposedEstablishment: ClaimProposedEstablishment,
    private readonly merchantProfile: MerchantProfile,
  ) {}

  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VerifiedEmailGuard)
  @Roles('reportante')
  // NOT_AT_ESTABLISHMENT y CHAIN_STORE_NOT_CLAIMABLE son DomainError: el filtro de errores responde 422.
  async claim(
    @Body() body: ClaimEstablishmentDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<ClaimResult | ProposedClaimResult> {
    const { establishmentId, newEstablishment } = body;
    if ((establishmentId === undefined) === (newEstablishment === undefined)) {
      throw new RequestValidationError(
        'establishmentId: envía la tienda del mapa (establishmentId) o la tienda nueva (newEstablishment), no las dos',
      );
    }
    const claim = {
      accountId: session.accountId,
      responsibleName: body.responsibleName,
      ...(body.nit === undefined ? {} : { nit: body.nit }),
      phone: body.phone,
      acceptedTermsVersion: body.acceptedTermsVersion,
      location: { lat: body.location.lat, lng: body.location.lng },
    };
    try {
      if (newEstablishment) {
        const { address, ...store } = newEstablishment;
        return await this.claimProposedEstablishment.execute({
          ...claim,
          newEstablishment: { ...store, ...(address === undefined ? {} : { address }) },
        });
      }
      return await this.claimEstablishment.execute({
        ...claim,
        establishmentId: establishmentId ?? '',
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
  // El reportante sin tienda recibe 404; la cuenta pre-aprobada sigue siendo reportante.
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
