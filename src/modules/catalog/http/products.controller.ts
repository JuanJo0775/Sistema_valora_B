import { Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import { GetProduct, ProductNotFoundError } from '../application/get-product';
import { type ProductResponse, toProductResponse } from './product.response';

@Controller('products')
export class ProductsController {
  constructor(private readonly getProduct: GetProduct) {}

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
