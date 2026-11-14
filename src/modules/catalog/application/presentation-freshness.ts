import type { ProductRepository } from './product-repository';

// Puerta de entrada pública para que reliability conozca el TTL de una presentación sin leer las
// tablas de catalog (grill de la #31). null si la presentación no existe.
export class PresentationFreshness {
  constructor(private readonly products: ProductRepository) {}

  isFresh(presentationId: string): Promise<boolean | null> {
    return this.products.isFreshPresentation(presentationId);
  }
}
