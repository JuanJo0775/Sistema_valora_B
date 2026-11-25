// H5: el reclamo de comercio del que nace una tienda propuesta. Lo que el moderador necesita para
// saber a quién verifica; nunca la cuenta, el correo ni la clave seudónima (EC-08).
export interface ProposalClaim {
  responsibleName: string;
  phone: string;
  // Sin NIT, el comercio es informal.
  nit?: string;
  grantsMerchantRole: true;
}

export interface ProposalClaimSource {
  // Solo las propuestas que nacen de un reclamo, por id de propuesta.
  of(proposalIds: string[]): Promise<Map<string, ProposalClaim>>;
}

// Puerto invertido: commerce depende de establishments y no al revés (EC-05), así que commerce
// registra aquí su fuente al arrancar. Sin nadie registrado, la cola no cambia.
export class ProposalClaims implements ProposalClaimSource {
  private source?: ProposalClaimSource;

  register(source: ProposalClaimSource): void {
    this.source = source;
  }

  async of(proposalIds: string[]): Promise<Map<string, ProposalClaim>> {
    if (!this.source || proposalIds.length === 0) return new Map();
    return this.source.of(proposalIds);
  }
}
