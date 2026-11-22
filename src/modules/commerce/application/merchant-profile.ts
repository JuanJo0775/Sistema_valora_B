import type { MerchantClaim, MerchantClaimRepository } from './merchant-claims';

export interface MerchantProfilePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // La tienda del mapa, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

export interface MerchantProfileView {
  status: MerchantClaim['status'];
  establishment: { id: string; name: string };
  responsibleName: string;
  informal: boolean;
  verifiedAt: Date;
}

// GET /commerce/me: lo que el comercio ve de sí mismo. Nunca una ubicación (EC-08).
export class MerchantProfile {
  constructor(private readonly ports: MerchantProfilePorts) {}

  async find(accountId: string): Promise<MerchantProfileView | null> {
    const claim = await this.ports.claims.findByAccount(accountId);
    if (!claim) return null;
    const establishment = await this.ports.establishments.find(claim.establishmentId);
    return {
      status: claim.status,
      establishment: { id: claim.establishmentId, name: establishment?.name ?? '' },
      responsibleName: claim.responsibleName,
      informal: claim.informal,
      verifiedAt: claim.verifiedAt,
    };
  }
}
