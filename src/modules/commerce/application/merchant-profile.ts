import {
  PRE_APPROVED_UNLOCKS,
  type MerchantClaim,
  type MerchantClaimRejection,
  type MerchantClaimRepository,
} from './merchant-claims';

export interface MerchantProfilePorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'> & {
    // La última solicitud cerrada de la cuenta, o null.
    lastRejection(accountId: string): Promise<MerchantClaimRejection | null>;
  };
  // La tienda del mapa o la propuesta, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

// H15: la nota del moderador al revocar es interna (puede nombrar a quien denunció) y queda en la bitácora;
// la cuenta revocada ve siempre este mensaje.
export const REVOCATION_MESSAGE = 'Moderación revocó el registro de esta cuenta para esa tienda.';

export type MerchantProfileView = ActiveMerchantProfile | RejectedMerchantProfile;

export interface ActiveMerchantProfile {
  status: MerchantClaim['status'];
  establishment: { id: string; name: string };
  responsibleName: string;
  informal: boolean;
  verifiedAt: Date | null;
  // H36 (ADR-040): si el portal puede ofrecer «eliminar la tienda» (la creó esta cuenta).
  canDeleteEstablishment: boolean;
  // Solo pre-aprobado: lo que podrá hacer cuando se apruebe su tienda (D2).
  unlocks?: typeof PRE_APPROVED_UNLOCKS;
}

// La tienda propuesta no se aprobó: la cuenta puede registrar otra (D2).
export interface RejectedMerchantProfile {
  // Precisión de D3 (#208): revocado por un moderador.
  status: 'rechazado' | 'revocado';
  reason: string;
  rejectedAt: Date;
}

// GET /commerce/me: lo que el comercio ve de sí mismo. Nunca una ubicación (EC-08).
export class MerchantProfile {
  constructor(private readonly ports: MerchantProfilePorts) {}

  async find(accountId: string): Promise<MerchantProfileView | null> {
    const claim = await this.ports.claims.findByAccount(accountId);
    if (!claim) {
      const rejection = await this.ports.claims.lastRejection(accountId);
      if (!rejection) return null;
      const revoked = rejection.outcome === 'revocado';
      return {
        status: revoked ? 'revocado' : 'rechazado',
        // El rechazo de una tienda propuesta sí conserva el motivo del moderador (B2).
        reason: revoked ? REVOCATION_MESSAGE : rejection.reason,
        rejectedAt: rejection.rejectedAt,
      };
    }
    const establishment = await this.ports.establishments.find(claim.establishmentId);
    return {
      status: claim.status,
      establishment: { id: claim.establishmentId, name: establishment?.name ?? '' },
      responsibleName: claim.responsibleName,
      informal: claim.informal,
      verifiedAt: claim.verifiedAt,
      canDeleteEstablishment: claim.status === 'verificado' && claim.createdEstablishment === true,
      ...(claim.status === 'pre_aprobado' ? { unlocks: PRE_APPROVED_UNLOCKS } : {}),
    };
  }
}
