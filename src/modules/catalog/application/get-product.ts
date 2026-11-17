import type { ProductRepository, ProductView } from './product-repository';

// No es una regla de negocio incumplida (422): la capa HTTP la traduce a 404 NOT_FOUND.
export class ProductNotFoundError extends Error {
  constructor(readonly productId: string) {
    super(`No existe el producto ${productId}.`);
    this.name = 'ProductNotFoundError';
  }
}

export class GetProduct {
  constructor(private readonly products: ProductRepository) {}

  async execute(id: string): Promise<ProductView> {
    const product = await this.products.findById(id);
    if (!product) throw new ProductNotFoundError(id);
    return product;
  }
}
