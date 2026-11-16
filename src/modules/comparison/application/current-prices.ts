// Precio vigente de una presentación en una tienda, leído de price_current (ADR-004).
export interface CurrentPrice {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  observedAt: Date;
  // Grill de la #31, pregunta 5: «en_revision» si el único precio de la tienda es sospechoso.
  status: 'vigente' | 'en_revision';
}

// Puerto hacia la tabla propia del módulo.
export interface CurrentPrices {
  findByPresentations(presentationIds: string[]): Promise<CurrentPrice[]>;
  // Grill de la #28: todos los precios de una tienda.
  findByEstablishment(establishmentId: string): Promise<CurrentPrice[]>;
  // B#120: todos los precios, para la canasta básica de un municipio.
  findAll(): Promise<CurrentPrice[]>;
}
