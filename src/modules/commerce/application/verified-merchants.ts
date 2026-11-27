import type { MerchantClaim } from './merchant-claims';

// Un máximo razonable para una lista que se lee en pantalla; el total dice si hay más.
export const VERIFIED_MERCHANTS_LIMIT = 100;

export interface VerifiedMerchantsPorts {
  claims: {
    // Los comercios verificados, el más reciente primero, y cuántos hay en total.
    listVerified(limit: number): Promise<{ items: MerchantClaim[]; total: number }>;
  };
  // La tienda, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

export interface VerifiedMerchantItem {
  establishment: { id: string; name: string };
  responsibleName: string;
  nit: string | null;
  phone: string;
  verifiedAt: Date | null;
}

// H14: los comercios verificados para moderación. Datos del comercio que la persona escribió; nunca su
// cuenta ni su correo (EC-08).
export class VerifiedMerchants {
  constructor(private readonly ports: VerifiedMerchantsPorts) {}

  async execute(): Promise<{ items: VerifiedMerchantItem[]; total: number }> {
    const { items, total } = await this.ports.claims.listVerified(VERIFIED_MERCHANTS_LIMIT);
    return {
      total,
      items: await Promise.all(
        items.map(async (claim) => ({
          establishment: {
            id: claim.establishmentId,
            name: (await this.ports.establishments.find(claim.establishmentId))?.name ?? '',
          },
          responsibleName: claim.responsibleName,
          nit: claim.nit,
          phone: claim.phone,
          verifiedAt: claim.verifiedAt,
        })),
      ),
    };
  }
}
