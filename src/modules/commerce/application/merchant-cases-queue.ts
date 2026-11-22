import type { MerchantCase } from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';

export interface MerchantCasesQueuePorts {
  cases: { pending(): Promise<MerchantCase[]> };
  claims: { findByEstablishment(establishmentId: string): Promise<MerchantClaim | null> };
  // La tienda del mapa, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

// Lo que el moderador necesita para decidir; nunca quién abrió el caso ni la cuenta del dueño (EC-08).
export interface MerchantCaseItem {
  id: string;
  kind: MerchantCase['kind'];
  establishment: { id: string; name: string };
  // null si el comercio ya no existe (por ejemplo, otro caso ya lo revocó).
  owner: {
    responsibleName: string;
    nit: string | null;
    phone: string;
    status: MerchantClaim['status'];
    verifiedAt: Date | null;
  } | null;
  reason: string;
  createdAt: Date;
}

// D2 y D3 del grill comercial: denuncias y disputas pendientes, la más antigua primero.
export class MerchantCasesQueue {
  constructor(private readonly ports: MerchantCasesQueuePorts) {}

  async list(): Promise<MerchantCaseItem[]> {
    const { cases, claims, establishments } = this.ports;
    const items: MerchantCaseItem[] = [];
    for (const merchantCase of await cases.pending()) {
      const { establishmentId } = merchantCase;
      const store = await establishments.find(establishmentId);
      const claim = await claims.findByEstablishment(establishmentId);
      items.push({
        id: merchantCase.id,
        kind: merchantCase.kind,
        establishment: { id: establishmentId, name: store?.name ?? '' },
        owner: claim && {
          responsibleName: claim.responsibleName,
          nit: claim.nit,
          phone: claim.phone,
          status: claim.status,
          verifiedAt: claim.verifiedAt,
        },
        reason: merchantCase.reason,
        createdAt: merchantCase.createdAt,
      });
    }
    return items;
  }
}
