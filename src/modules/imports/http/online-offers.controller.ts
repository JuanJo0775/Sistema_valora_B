import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { IsIn } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import { ListOnlineOffers } from '../application/list-online-offers';

class OnlineOffersQueryDto {
  @IsIn(['armenia-centro'])
  zone!: 'armenia-centro';
}

interface OnlineOfferResponse {
  presentationId: string;
  source: 'olimpica';
  zone: 'armenia-centro';
  priceCop: number;
  observedAt: string;
  expiresAt: string;
}

@Controller('products')
export class OnlineOffersController {
  constructor(private readonly offers: ListOnlineOffers) {}

  @Get(':productId/online-offers')
  @Header('Cache-Control', 'no-store')
  async list(
    @Param(
      'productId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
    @Query() query: OnlineOffersQueryDto,
  ): Promise<{ items: OnlineOfferResponse[] }> {
    const items = await this.offers.execute(productId, query.zone, new Date());
    if (items === null) throw new NotFoundException();
    return { items };
  }
}
