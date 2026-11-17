import type { ProductRepository, ProductSummaryView } from './product-repository';

// Puerta de entrada pública para que la canasta básica (B#120) muestre el nombre, la categoría y la imagen de
// cada producto sin leer las tablas de catalog. Solo devuelve los ids que existen.
export class ProductSummaries {
  constructor(private readonly products: ProductRepository) {}

  of(productIds: string[]): Promise<Map<string, ProductSummaryView>> {
    return this.products.summariesOf(productIds);
  }
}
