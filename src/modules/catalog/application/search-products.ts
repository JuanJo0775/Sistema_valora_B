import type { ProductRepository, ProductView } from './product-repository';

export interface SearchProductsInput {
  q?: string;
  limit: number;
}

export class SearchProducts {
  constructor(private readonly products: ProductRepository) {}

  execute(input: SearchProductsInput): Promise<ProductView[]> {
    return this.products.search({ text: input.q ?? '', limit: input.limit });
  }
}
