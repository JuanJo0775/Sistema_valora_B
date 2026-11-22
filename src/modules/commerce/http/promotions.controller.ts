import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { type AuthenticatedSession, CurrentSession, Roles, SessionGuard } from '../../identity';
import { RequestValidationError } from '../../../shared/http/validation';
import { CreatePromotion } from '../application/create-promotion';
import { MerchantPromotions } from '../application/merchant-promotions';
import type { PromotionView } from '../application/promotions';
import { MerchantNotVerifiedError } from '../application/publish-official-price';
import { PromotionNotFoundError, WithdrawPromotion } from '../application/withdraw-promotion';
import { CreatePromotionDto, offerOf } from './promotions.dto';

// La oferta aplanada, como en el esquema Promotion del contrato.
type PromotionResponse = Omit<PromotionView, 'offer'> & PromotionView['offer'];
const toResponse = ({ offer, ...promotion }: PromotionView): PromotionResponse => ({
  ...promotion,
  ...offer,
});

// Un comercio sin tienda verificada recibe 403 con su propio código; una promoción ajena, 404.
async function asMerchant<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MerchantNotVerifiedError) {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    if (error instanceof PromotionNotFoundError) throw new NotFoundException();
    throw error;
  }
}

// RF-017 con la D6 del grill comercial (#206). OFFICIAL_PRICE_REQUIRED e INVALID_PROMOTION son
// DomainError: el filtro de errores responde 422.
@Controller('commerce/promotions')
export class PromotionsController {
  constructor(
    private readonly createPromotion: CreatePromotion,
    private readonly merchantPromotions: MerchantPromotions,
    private readonly withdrawPromotion: WithdrawPromotion,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async create(
    @Body() body: CreatePromotionDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<PromotionResponse> {
    const created = await asMerchant(() =>
      this.createPromotion.execute({
        accountId: session.accountId,
        presentationId: body.presentationId,
        offer: offerOf(body),
        conditions: {
          ...(body.conditions.maxPerCustomer === undefined
            ? {}
            : { maxPerCustomer: body.conditions.maxPerCustomer }),
          whileStocksLast: body.conditions.whileStocksLast,
          paymentMethod: body.conditions.paymentMethod,
        },
        validFrom: body.validFrom,
        validUntil: body.validUntil,
      }),
    );
    return toResponse(created);
  }

  // Dato de la propia cuenta: nunca en una caché compartida.
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: PromotionResponse[] }> {
    const items = await asMerchant(() => this.merchantPromotions.execute(session.accountId));
    return { items: items.map(toResponse) };
  }

  @Delete(':promotionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('comercio')
  async withdraw(
    @Param(
      'promotionId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('promotionId: debe ser un UUID'),
      }),
    )
    promotionId: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await asMerchant(() => this.withdrawPromotion.execute(session.accountId, promotionId));
  }
}
