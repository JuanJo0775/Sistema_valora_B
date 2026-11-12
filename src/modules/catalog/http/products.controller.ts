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
import { GetProduct, ProductNotFoundError } from '../application/get-product';
import { SearchProducts } from '../application/search-products';
import { type ProductResponse, toProductResponse } from './product.response';
import { SearchProductsQueryDto } from './search-products.query';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly getProduct: GetProduct,
    private readonly searchProducts: SearchProducts,
  ) {}

  // Grill de la #52, pregunta 4: caché pública de 30 segundos (valor inicial calibrable, EC-04).
  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  async search(@Query() query: SearchProductsQueryDto): Promise<{ items: ProductResponse[] }> {
    // Grill de la #52, pregunta 3: se escribe o se escanea, nunca las dos cosas ni ninguna.
    if (query.q === undefined && query.barcode === undefined) {
      throw new RequestValidationError('Envía q o barcode');
    }
    if (query.q !== undefined && query.barcode !== undefined) {
      throw new RequestValidationError('Envía solo q o barcode, no ambos');
    }
    const found = await this.searchProducts.execute(query);
    return { items: found.map(toProductResponse) };
  }

  // Grill de la #49, pregunta 7: caché pública de 5 minutos (valor inicial calibrable, EC-04).
  @Get(':productId')
  @Header('Cache-Control', 'public, max-age=300')
  async findOne(
    @Param(
      'productId',
      // Un id que no es UUID responde 400 VALIDATION_ERROR, con el mismo formato que los DTOs.
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('productId: debe ser un UUID'),
      }),
    )
    productId: string,
  ): Promise<ProductResponse> {
    try {
      return toProductResponse(await this.getProduct.execute(productId));
    } catch (error) {
      if (error instanceof ProductNotFoundError) throw new NotFoundException();
      throw error;
    }
  }
}
