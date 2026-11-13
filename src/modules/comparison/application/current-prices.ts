// Precio vigente de una presentación en una tienda, leído de price_current (ADR-004).
export interface CurrentPrice {
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  observedAt: Date;
}

// Puerto hacia la tabla propia del módulo.
export interface CurrentPrices {
  findByPresentations(presentationIds: string[]): Promise<CurrentPrice[]>;
}
