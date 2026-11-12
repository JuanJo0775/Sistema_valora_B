import type { ProductRepository, ProductView } from './product-repository';

export class GetProduct {
  constructor(private readonly products: ProductRepository) {}

  async execute(id: string): Promise<ProductView> {
    const product = await this.products.findById(id);
    return product as ProductView;
  }
}
