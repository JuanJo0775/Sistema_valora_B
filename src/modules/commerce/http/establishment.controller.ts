import { Body, Controller, ForbiddenException, Patch, UseGuards } from '@nestjs/common';
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from '../../identity';
import { MerchantNotVerifiedError } from '../application/publish-official-price';
import {
  type StoreDetailsUpdateResult,
  UpdateMyEstablishment,
} from '../application/update-my-establishment';
import { UpdateEstablishmentDto } from './establishment.dto';

// D5 del grill comercial (#207). INVALID_OPENING_HOURS es un DomainError: el filtro responde 422.
@Controller('commerce/establishment')
export class EstablishmentController {
  constructor(private readonly updateMyEstablishment: UpdateMyEstablishment) {}

  @Patch()
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async update(
    @Body() body: UpdateEstablishmentDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<StoreDetailsUpdateResult> {
    try {
      return await this.updateMyEstablishment.execute(session.accountId, {
        ...(body.openingHours === undefined ? {} : { openingHours: body.openingHours }),
        ...(body.phone === undefined ? {} : { phone: body.phone }),
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.location === undefined
          ? {}
          : { location: { lat: body.location.lat, lng: body.location.lng } }),
      });
    } catch (error) {
      if (error instanceof MerchantNotVerifiedError) {
        throw new ForbiddenException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }
}
