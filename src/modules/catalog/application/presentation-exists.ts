import type { ProductRepository } from './product-repository';

// Puerta de entrada pública para que pricing compruebe una presentación sin leer las tablas de
// catalog (grill de la #14, pregunta 5).
export class PresentationExists {
  constructor(private readonly products: ProductRepository) {}

  exists(presentationId: string): Promise<boolean> {
    return this.products.presentationExists(presentationId);
  }
}
