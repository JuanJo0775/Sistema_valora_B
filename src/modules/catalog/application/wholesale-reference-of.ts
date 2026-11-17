import type { WholesaleReferenceRepository, WholesaleReferenceView } from './wholesale-references';

// Puerta de entrada pública para que comparison muestre la referencia SIPSA de un producto sin leer
// las tablas de catalog (grill de la #34, pregunta 1).
export class WholesaleReferenceOf {
  constructor(private readonly references: Pick<WholesaleReferenceRepository, 'latestFor'>) {}

  latestFor(productId: string): Promise<WholesaleReferenceView | null> {
    return this.references.latestFor(productId);
  }
}
