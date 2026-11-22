import type { ProductRepository } from './product-repository';

// Puerta de entrada pública (D7 del grill comercial, #205): commerce encuentra las presentaciones del
// archivo de precios oficiales por su código de barras, sin leer las tablas de catalog.
export class PresentationsByBarcode {
  constructor(private readonly products: Pick<ProductRepository, 'presentationIdsByBarcodes'>) {}

  byBarcodes(barcodes: string[]): Promise<Map<string, string>> {
    return this.products.presentationIdsByBarcodes(barcodes);
  }
}
