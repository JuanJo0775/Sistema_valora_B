import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from '../../identity';
import {
  MerchantOfficialPrices,
  type OfficialPriceView,
} from '../application/merchant-official-prices';
import type { OfficialPrice } from '../application/official-prices';
import {
  MerchantNotVerifiedError,
  PublishOfficialPrice,
} from '../application/publish-official-price';
import { ReconfirmOfficialPrices } from '../application/reconfirm-official-prices';
import { PublishOfficialPriceDto } from './official-prices.dto';

// Un comercio sin tienda verificada recibe 403 con su propio código.
async function asMerchant<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MerchantNotVerifiedError) {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    throw error;
  }
}

// RF-016 con la D4 del grill comercial (#203). UNKNOWN_PRESENTATION e IMPLAUSIBLE_PRICE son
// DomainError: el filtro de errores responde 422.
@Controller('commerce/prices')
export class OfficialPricesController {
  constructor(
    private readonly publishOfficialPrice: PublishOfficialPrice,
    private readonly merchantOfficialPrices: MerchantOfficialPrices,
    private readonly reconfirmOfficialPrices: ReconfirmOfficialPrices,
  ) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  publish(
    @Body() body: PublishOfficialPriceDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<OfficialPrice> {
    return asMerchant(() =>
      this.publishOfficialPrice.execute({
        accountId: session.accountId,
        presentationId: body.presentationId,
        priceCop: body.priceCop,
      }),
    );
  }

  // Dato de la propia cuenta: nunca en una caché compartida.
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: OfficialPriceView[] }> {
    const items = await asMerchant(() => this.merchantOfficialPrices.execute(session.accountId));
    return { items };
  }

  // D4: «Todos mis precios siguen igual».
  @Post('reconfirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  reconfirm(@CurrentSession() session: AuthenticatedSession): Promise<{ reconfirmed: number }> {
    return asMerchant(() => this.reconfirmOfficialPrices.execute(session.accountId));
  }
}
