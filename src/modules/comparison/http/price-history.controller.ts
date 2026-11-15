import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { RequestValidationError } from '../../../shared/http/validation';
import { PriceHistory, type ProductPriceHistory } from '../application/price-history';

// Parámetros de GET /v1/products/{productId}/history (contrato de la #83).
export class PriceHistoryQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'debe ser un UUID' })
  establishmentId?: string;
}

// RF-008 RN4 (grill de la #83): la evolución del precio de un producto.
@Controller('products')
export class PriceHistoryController {
  constructor(private readonly history: PriceHistory) {}

  // Pregunta 7: pública y sin la ubicación del usuario, así que se guarda en caché (EC-04).
  // Express agrega el ETag y responde 304 con If-None-Match.
  @Get(':productId/history')
  @Header('Cache-Control', 'public, max-age=300')
  async of(
    @Param(
      'productId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
    @Query() query: PriceHistoryQueryDto,
  ): Promise<ProductPriceHistory> {
    const result = await this.history.of(
      productId,
      query.establishmentId === undefined ? {} : { establishmentId: query.establishmentId },
    );
    if (!result) throw new NotFoundException();
    return result;
  }
}
