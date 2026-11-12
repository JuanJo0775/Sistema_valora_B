import type { ProductRepository, ProductView } from './product-repository';

// Exactamente uno de los dos (el controlador lo exige): se escribe o se escanea.
export type SearchProductsInput =
  | { q: string; barcode?: undefined; limit: number }
  | { q?: undefined; barcode: string; limit: number };

export class SearchProducts {
  constructor(private readonly products: ProductRepository) {}

  execute(input: SearchProductsInput): Promise<ProductView[]> {
    if (input.barcode !== undefined) return this.products.findByBarcode(input.barcode);
    return this.products.search({ text: input.q, limit: input.limit });
  }
}
