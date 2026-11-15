import type { ProductRepository } from './product-repository';

// Puerta de entrada pública para que reliability muestre nombres en la cola de moderación sin leer
// las tablas de catalog (grill de la #32, pregunta 6). Solo devuelve los ids que existen.
export class PresentationLabels {
  constructor(private readonly products: ProductRepository) {}

  of(presentationIds: string[]): Promise<Map<string, string>> {
    return this.products.labelsOf(presentationIds);
  }
}
