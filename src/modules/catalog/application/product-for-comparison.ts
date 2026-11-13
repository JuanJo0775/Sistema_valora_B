import type { ProductForComparisonView, ProductRepository } from './product-repository';

// Puerta de entrada pública para que comparison lea el producto sin leer las tablas de catalog
// (grill de la #15, pregunta 2).
export class ProductForComparison {
  constructor(private readonly products: ProductRepository) {}

  find(productId: string): Promise<ProductForComparisonView | null> {
    return this.products.findForComparison(productId);
  }
}
