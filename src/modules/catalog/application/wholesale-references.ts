// Grill de la #34 (RF-014 RN3): precio mayorista de SIPSA, siempre como referencia pública y nunca
// como precio de una tienda.
export interface WholesaleReference {
  id: string;
  productId: string;
  // Nombre del producto tal como aparece en el boletín SIPSA.
  sipsaName: string;
  market: string;
  // Fechas AAAA-MM-DD del periodo del boletín.
  periodStart: string;
  periodEnd: string;
  pricePerKgCop: number;
  sourceUrl: string;
  // RF-014 RN5: trazabilidad de la carga manual; no sale en respuestas públicas.
  responsible: string;
  consultedAt: string;
}

// Lo que la comparación muestra; sin el responsable de la carga.
export type WholesaleReferenceView = Omit<WholesaleReference, 'id' | 'responsible' | 'consultedAt'>;

export interface WholesaleReferenceRepository {
  // Inserta o actualiza por id: repetir la semilla no duplica.
  save(reference: WholesaleReference): Promise<void>;
  // La de periodo más reciente del producto.
  latestFor(productId: string): Promise<WholesaleReferenceView | null>;
}

export const WHOLESALE_REFERENCE_REPOSITORY = Symbol('WHOLESALE_REFERENCE_REPOSITORY');
