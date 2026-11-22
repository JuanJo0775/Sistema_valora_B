// D1 y D4 del grill comercial (#204): la copia del precio oficial que comparison guarda con los
// eventos de commerce.
export interface OfficialPriceCopy {
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  // La vigencia cuenta desde aquí (ADR-005).
  confirmedAt: Date;
  // Solo los reportes posteriores corroboran una discrepancia (D1).
  priceChangedAt: Date;
}

// Puerto hacia la tabla propia del módulo.
export interface OfficialPriceCopies {
  findAll(): Promise<OfficialPriceCopy[]>;
  findByPresentations(presentationIds: string[]): Promise<OfficialPriceCopy[]>;
  // B9 (#209): los de una tienda, para avisarle sus discrepancias.
  findByEstablishment(establishmentId: string): Promise<OfficialPriceCopy[]>;
  // #218: los de varias tiendas, para contar sus precios.
  findByEstablishments(establishmentIds: string[]): Promise<OfficialPriceCopy[]>;
}
