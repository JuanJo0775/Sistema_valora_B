import {
  Body,
  Controller,
  ForbiddenException,
  PayloadTooLargeException,
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
  type MerchantPriceList,
} from '../application/merchant-official-prices';
import {
  MerchantNotVerifiedError,
  PublishOfficialPrice,
  type PublishedOfficialPrice,
} from '../application/publish-official-price';
import { ReconfirmOfficialPrices } from '../application/reconfirm-official-prices';
import { UploadOfficialPrices, type UploadResult } from '../application/upload-official-prices';
import { InvalidPriceFileError, PriceFileTooLargeError } from '../../../domain/official-price-file';
import { RequestValidationError } from '../../../shared/http/validation';
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

// RF-016 con la D4 del grill comercial (#203). UNKNOWN_PRESENTATION, IMPLAUSIBLE_PRICE e
// IMPLAUSIBLE_OFFICIAL_PRICE (ADR-037) son DomainError: el filtro de errores responde 422.
@Controller('commerce/prices')
export class OfficialPricesController {
  constructor(
    private readonly publishOfficialPrice: PublishOfficialPrice,
    private readonly merchantOfficialPrices: MerchantOfficialPrices,
    private readonly reconfirmOfficialPrices: ReconfirmOfficialPrices,
    private readonly uploadOfficialPrices: UploadOfficialPrices,
  ) {}

  // D7: el archivo CSV, procesado al momento. Sin Content-Type text/csv el cuerpo no es texto.
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async upload(
    @Body() body: unknown,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<UploadResult> {
    if (typeof body !== 'string') {
      throw new RequestValidationError('archivo: envía el archivo como text/csv.');
    }
    try {
      return await asMerchant(() => this.uploadOfficialPrices.execute(session.accountId, body));
    } catch (error) {
      if (error instanceof InvalidPriceFileError) {
        throw new RequestValidationError(`archivo: ${error.message}`);
      }
      if (error instanceof PriceFileTooLargeError) {
        throw new PayloadTooLargeException(error.message);
      }
      throw error;
    }
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  publish(
    @Body() body: PublishOfficialPriceDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<PublishedOfficialPrice> {
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
  list(@CurrentSession() session: AuthenticatedSession): Promise<MerchantPriceList> {
    return asMerchant(() => this.merchantOfficialPrices.execute(session.accountId));
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
