// ADR-030: precio vigente de una presentación en una tienda, sin datos de quién lo reportó.
export interface PeerPrice {
  establishmentId: string;
  priceCop: number;
}

// Puerto hacia la tabla propia del módulo.
export interface PeerPriceStore {
  // Los precios con estado «vigente» de esa presentación y tipo de precio, en todas las tiendas
  // (datos iniciales incluidos), en una sola consulta.
  vigentesOf(presentationId: string, priceType: 'normal' | 'oferta'): Promise<PeerPrice[]>;
}

// Consulta pública para que pricing arme la referencia de plausibilidad sin leer las tablas de
// comparison (ADR-030). Los precios en revisión nunca son referencia.
export class PeerPrices {
  constructor(private readonly store: PeerPriceStore) {}

  vigentesOf(presentationId: string, priceType: 'normal' | 'oferta'): Promise<PeerPrice[]> {
    return this.store.vigentesOf(presentationId, priceType);
  }
}
