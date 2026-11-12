import { Controller, Get, Header, Param } from '@nestjs/common';
import { GetProduct } from '../application/get-product';
import { type ProductResponse, toProductResponse } from './product.response';

@Controller('products')
export class ProductsController {
  constructor(private readonly getProduct: GetProduct) {}

  // Grill de la #49, pregunta 7: caché pública de 5 minutos (valor inicial calibrable, EC-04).
  @Get(':productId')
  @Header('Cache-Control', 'public, max-age=300')
  async findOne(@Param('productId') productId: string): Promise<ProductResponse> {
    return toProductResponse(await this.getProduct.execute(productId));
  }
}
