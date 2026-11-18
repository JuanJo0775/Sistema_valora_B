import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { CACHE_PRICES, NO_STORE } from '../../../shared/http/cache-control';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  CompareProduct,
  DistanceNeedsLocationError,
  MissingAreaError,
} from '../application/compare-product';
import { ComparisonQueryDto } from './comparison.query';
import { type ComparisonResponse, toComparisonResponse } from './comparison.response';

// Lo único que se usa de la respuesta HTTP: la cabecera de caché depende de si llegó la ubicación.
interface HeaderTarget {
  setHeader(name: string, value: string): unknown;
}

@Controller('products')
export class ComparisonController {
  constructor(private readonly compareProduct: CompareProduct) {}

  // no-store cuando la URL lleva la ubicación del usuario (lat/lng): no debe quedar en ninguna caché
  // (EC-08, grill de la #15, pregunta 3). Con solo el municipio no hay dato personal y se cachea
  // 60 s como máximo en la caché compartida (ADR-031); Express agrega el ETag.
  @Get(':productId/comparison')
  async compare(
    @Param(
      'productId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
    @Query() query: ComparisonQueryDto,
    @Res({ passthrough: true }) response: HeaderTarget,
  ): Promise<ComparisonResponse> {
    const { lat, lng, municipality, radiusKm, sort, onlyCurrent } = query;
    // Cualquiera de las dos coordenadas basta para tratarla como ubicada: ante la duda, no-store.
    const located = lat !== undefined || lng !== undefined;
    response.setHeader('Cache-Control', located ? NO_STORE : CACHE_PRICES);
    try {
      const comparison = await this.compareProduct.execute({
        productId,
        ...(lat === undefined ? {} : { lat }),
        ...(lng === undefined ? {} : { lng }),
        ...(municipality === undefined ? {} : { municipality }),
        radiusKm,
        sort,
        onlyCurrent,
      });
      if (!comparison) throw new NotFoundException();
      return toComparisonResponse(comparison);
    } catch (error) {
      // Grill de la #106: errores de los datos enviados (400).
      if (error instanceof DistanceNeedsLocationError) {
        throw new RequestValidationError(
          'sort: para ordenar por distancia hay que enviar lat y lng',
        );
      }
      if (error instanceof MissingAreaError) throw new RequestValidationError(error.message);
      throw error;
    }
  }
}
