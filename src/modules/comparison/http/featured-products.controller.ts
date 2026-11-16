import { Controller, Get, Header, Query } from '@nestjs/common';
import type { Municipality } from '../../../domain/municipality';
import { FeaturedProducts } from '../application/featured-products';
import { FeaturedProductsQueryDto } from './comparison.query';

// DTO de salida explícito: la forma de GET /v1/featured-products. Sin datos del reportante (EC-08).
interface FeaturedProductsResponse {
  criteria: { municipality: Municipality; sort: 'store_count' };
  items: {
    productId: string;
    name: string;
    brand?: string;
    category: { code: string; name: string };
    storeCount: number;
    cheapest: {
      presentationId: string;
      label: string;
      priceCop: number;
      unitPrice: { valueCop: number; per: string };
      establishment: { id: string; name: string };
    };
  }[];
}

// B#120: la canasta básica de hoy. Cuelga de su propia ruta porque /products/{productId} es de
// catalog y Express tomaría «featured» como un id.
@Controller('featured-products')
export class FeaturedProductsController {
  constructor(private readonly featured: FeaturedProducts) {}

  // La URL no lleva la ubicación del usuario: caché pública de 60 s, como los precios de una tienda
  // (EC-04). Express agrega el ETag y responde 304 con If-None-Match.
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  async list(@Query() query: FeaturedProductsQueryDto): Promise<FeaturedProductsResponse> {
    const result = await this.featured.of({ municipality: query.municipality, limit: query.limit });
    return {
      criteria: result.criteria,
      items: result.items.map(({ cheapest, ...item }) => ({
        ...item,
        cheapest: {
          ...cheapest,
          // Se muestra redondeado; el valor exacto no sale de la aplicación.
          unitPrice: { valueCop: cheapest.unitPrice.displayCop, per: cheapest.unitPrice.per },
        },
      })),
    };
  }
}
