import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import { CompareProduct } from '../application/compare-product';
import { ComparisonQueryDto } from './comparison.query';
import { type ComparisonResponse, toComparisonResponse } from './comparison.response';

@Controller('products')
export class ComparisonController {
  constructor(private readonly compareProduct: CompareProduct) {}

  // no-store: la URL lleva la ubicación del usuario y no debe quedar en ninguna caché (EC-08,
  // grill de la #15, pregunta 3).
  @Get(':productId/comparison')
  @Header('Cache-Control', 'no-store')
  async compare(
    @Param(
      'productId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
    @Query() query: ComparisonQueryDto,
  ): Promise<ComparisonResponse> {
    const { lat, lng, radiusKm, sort, onlyCurrent } = query;
    const comparison = await this.compareProduct.execute({
      productId,
      lat,
      lng,
      radiusKm,
      sort,
      onlyCurrent,
    });
    if (!comparison) throw new NotFoundException();
    return toComparisonResponse(comparison);
  }
}
