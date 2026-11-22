import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Municipality } from '../../../domain/municipality';
import { CACHE_PRICES, NO_STORE } from '../../../shared/http/cache-control';
import { RequestValidationError } from '../../../shared/http/validation';
import { MissingAreaError } from '../application/compare-product';
import { type FeaturedPrice, FeaturedProducts } from '../application/featured-products';
import { FeaturedProductsQueryDto } from './comparison.query';

interface FeaturedPriceResponse {
  presentationId: string;
  label: string;
  priceCop: number;
  unitPrice: { valueCop: number; per: string };
  establishment: {
    id: string;
    name: string;
    address?: string;
    neighborhood?: string;
    distanceM?: number;
  };
}

// DTO de salida explícito: la forma de GET /v1/featured-products. Sin datos del reportante (EC-08).
interface FeaturedProductsResponse {
  criteria: {
    municipality?: Municipality;
    radiusKm?: number;
    category?: string;
    sort: 'store_count';
  };
  storesWithPrices: number;
  // Productos destacables con los mismos filtros, y si quedan más después de esta página.
  total: number;
  hasMore: boolean;
  items: {
    productId: string;
    name: string;
    brand?: string;
    category: { code: string; name: string };
    image?: { url: string; source: string; attribution: string };
    storeCount: number;
    cheapest: FeaturedPriceResponse;
    priciest?: FeaturedPriceResponse;
    savingsPercent?: number;
  }[];
}

// Lo único que se usa de la respuesta HTTP: la cabecera de caché depende de si llegó la ubicación.
interface HeaderTarget {
  setHeader(name: string, value: string): unknown;
}

// Se muestra redondeado; el valor exacto no sale de la aplicación.
const toPriceResponse = ({ unitPrice, ...price }: FeaturedPrice): FeaturedPriceResponse => ({
  ...price,
  unitPrice: { valueCop: unitPrice.displayCop, per: unitPrice.per },
});

// B#120 y B#128: la canasta básica de hoy. Cuelga de su propia ruta porque /products/{productId} es
// de catalog y Express tomaría «featured» como un id.
@Controller('featured-products')
export class FeaturedProductsController {
  constructor(private readonly featured: FeaturedProducts) {}

  @Get()
  async list(
    @Query() query: FeaturedProductsQueryDto,
    @Res({ passthrough: true }) response: HeaderTarget,
  ): Promise<FeaturedProductsResponse> {
    const { lat, lng, municipality, radiusKm, category, limit, offset } = query;
    const located = lat !== undefined && lng !== undefined;
    // Con la ubicación del usuario en la URL, ninguna caché la guarda (EC-08), como la comparación.
    // Sin ella, caché pública de 60 s (EC-04); limit y offset van en la URL, que es la clave de caché.
    // Express agrega el ETag y responde 304 con If-None-Match.
    response.setHeader('Cache-Control', located ? NO_STORE : CACHE_PRICES);
    try {
      const result = await this.featured.of({
        ...(lat === undefined ? {} : { lat }),
        ...(lng === undefined ? {} : { lng }),
        ...(municipality === undefined ? {} : { municipality }),
        ...(category === undefined ? {} : { category }),
        radiusKm,
        limit,
        offset,
      });
      return {
        criteria: result.criteria,
        storesWithPrices: result.storesWithPrices,
        total: result.total,
        hasMore: result.hasMore,
        items: result.items.map(({ cheapest, priciest, ...item }) => ({
          ...item,
          cheapest: toPriceResponse(cheapest),
          ...(priciest === undefined ? {} : { priciest: toPriceResponse(priciest) }),
        })),
      };
    } catch (error) {
      if (error instanceof MissingAreaError) throw new RequestValidationError(error.message);
      throw error;
    }
  }
}
