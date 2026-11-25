import type { ProposalClaim, ProposalClaimSource } from '../../establishments';
import type { MerchantClaim } from './merchant-claims';

export interface PendingProposedClaims {
  // Las solicitudes pre-aprobadas de esas tiendas.
  pendingForMany(establishmentIds: string[]): Promise<MerchantClaim[]>;
}

// H5: lo que la cola de tiendas muestra de un reclamo. La tienda propuesta lleva el id de la solicitud
// que la espera (D2). Solo los datos del responsable: nunca la cuenta (EC-08).
export class ClaimsOfProposals implements ProposalClaimSource {
  constructor(private readonly claims: PendingProposedClaims) {}

  async of(proposalIds: string[]): Promise<Map<string, ProposalClaim>> {
    const claims = await this.claims.pendingForMany(proposalIds);
    return new Map(
      claims.map(({ establishmentId, responsibleName, phone, nit }) => [
        establishmentId,
        {
          responsibleName,
          phone,
          ...(nit === null ? {} : { nit }),
          // Aprobar (o fusionar con una tienda sin dueño) verifica al solicitante como comerciante.
          grantsMerchantRole: true as const,
        },
      ]),
    );
  }
}
