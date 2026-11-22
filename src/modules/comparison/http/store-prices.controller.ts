import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CACHE_PRICES } from '../../../shared/http/cache-control';
import { RequestValidationError } from '../../../shared/http/validation';
import type { EstablishmentDetail } from '../../establishments';
import { StorePrices } from '../application/store-prices';
import { StorePricesQueryDto } from './comparison.query';

// DTO de salida explícito: la forma de GET /v1/establishments/{establishmentId}/prices.
interface StorePricesResponse {
  establishment: EstablishmentDetail;
  prices: {
    productId: string;
    presentationId: string;
    productName: string;
    // #218: un precio oficial no viene de un reporte ni se califica.
    reportId?: string;
    priceCop: number;
    unitPrice: { valueCop: number; per: string };
    source: string;
    freshness: string;
    reliability?: string;
    confirmations?: number;
    observedAt: string;
    discrepancy?: {
      officialPriceCop: number;
      reportedPriceCop: number;
      reports: number;
      since: string;
    };
  }[];
}

// RF-008 (grill de la #28): la ruta cuelga de /establishments, pero los precios son de comparison.
@Controller('establishments')
export class StorePricesController {
  constructor(private readonly storePrices: StorePrices) {}

  // Pregunta 3: la URL no lleva la ubicación del usuario, así que se puede guardar en caché (EC-04).
  // Express agrega el ETag y responde 304 con If-None-Match.
  @Get(':establishmentId/prices')
  @Header('Cache-Control', CACHE_PRICES)
  async list(
    @Param(
      'establishmentId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('establishmentId: debe ser un UUID'),
      }),
    )
    establishmentId: string,
    @Query() query: StorePricesQueryDto,
  ): Promise<StorePricesResponse> {
    const result = await this.storePrices.of(establishmentId, { onlyCurrent: query.onlyCurrent });
    if (!result) throw new NotFoundException();
    return {
      establishment: result.establishment,
      prices: result.prices.map(({ unitPrice, observedAt, discrepancy, ...item }) => ({
        ...item,
        // Se muestra redondeado; el valor exacto no sale de la aplicación.
        unitPrice: { valueCop: unitPrice.displayCop, per: unitPrice.per },
        observedAt: observedAt.toISOString(),
        ...(discrepancy === undefined
          ? {}
          : { discrepancy: { ...discrepancy, since: discrepancy.since.toISOString() } }),
      })),
    };
  }
}
