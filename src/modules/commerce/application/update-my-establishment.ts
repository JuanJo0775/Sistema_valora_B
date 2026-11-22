import type { MerchantClaimRepository } from './merchant-claims';
import { verifiedEstablishmentOf } from './publish-official-price';

type DayHours = { opens: string; closes: string } | null;

// D5: lo que el comercio puede pedir cambiar de su tienda.
export interface StoreDetailsUpdate {
  openingHours?: Record<string, DayHours>;
  phone?: string;
  name?: string;
  location?: { lat: number; lng: number };
}

export interface StoreDetailsUpdateResult {
  applied: string[];
  inReview: string[];
}

export interface UpdateMyEstablishmentPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  // La interfaz pública de establishments decide qué se aplica y qué va al moderador (D5).
  stores: {
    update(
      establishmentId: string,
      accountId: string,
      change: StoreDetailsUpdate,
    ): Promise<StoreDetailsUpdateResult>;
  };
}

// D5 del grill comercial: commerce pide el cambio a establishments por su index.ts; no escribe en sus
// tablas (ADR-001).
export class UpdateMyEstablishment {
  constructor(private readonly ports: UpdateMyEstablishmentPorts) {}

  async execute(accountId: string, change: StoreDetailsUpdate): Promise<StoreDetailsUpdateResult> {
    const establishmentId = await verifiedEstablishmentOf(this.ports.claims, accountId);
    return this.ports.stores.update(establishmentId, accountId, change);
  }
}
