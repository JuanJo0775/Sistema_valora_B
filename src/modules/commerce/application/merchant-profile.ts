import { PRE_APPROVED_UNLOCKS } from './claim-proposed-establishment';
import type { MerchantClaim, MerchantClaimRepository } from './merchant-claims';

export interface MerchantProfilePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // La tienda del mapa o la propuesta, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

export interface MerchantProfileView {
  status: MerchantClaim['status'];
  establishment: { id: string; name: string };
  responsibleName: string;
  informal: boolean;
  verifiedAt: Date | null;
  // Solo pre-aprobado: lo que podrá hacer cuando se apruebe su tienda (D2).
  unlocks?: typeof PRE_APPROVED_UNLOCKS;
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
      ...(claim.status === 'pre_aprobado' ? { unlocks: PRE_APPROVED_UNLOCKS } : {}),
    };
  }
}
