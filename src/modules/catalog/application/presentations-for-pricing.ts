import type { PresentationForPricing, ProductRepository } from './product-repository';

// Puerta de entrada pública para los precios de una tienda (grill de la #28, pregunta 1). Solo
// devuelve los ids que existen.
export class PresentationsForPricing {
  constructor(private readonly products: ProductRepository) {}

  of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> {
    return this.products.pricingOf(presentationIds);
  }
}
