import type { CategoryView, ProductRepository } from './product-repository';

// #111: las categorías para proponer un producto (RF-003 RN3).
export class ListCategories {
  constructor(private readonly products: ProductRepository) {}

  execute(): Promise<CategoryView[]> {
    return this.products.listCategories();
  }
}
