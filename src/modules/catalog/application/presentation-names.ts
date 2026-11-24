import type { PresentationName, ProductRepository } from './product-repository';

// Puerta de entrada pública para que commerce muestre el nombre y la etiqueta de cada presentación
// en el portal sin leer las tablas de catalog (H3). Calculado del catálogo canónico, en una sola
// consulta por lote; solo devuelve los ids que existen.
export class PresentationNames {
  constructor(private readonly products: ProductRepository) {}

  of(presentationIds: string[]): Promise<Map<string, PresentationName>> {
    return this.products.namesOf(presentationIds);
  }
}
