import { createEvent } from '../../../shared/events';
import type { MerchantRevocations } from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import type { PromotionRepository } from './promotions';
import { withdrawalEvents } from './withdrawals';

export const MERCHANT_REVOKED = 'MerchantRevoked';

export interface RevokeMerchantPorts {
  claims: { findByEstablishment(establishmentId: string): Promise<MerchantClaim | null> };
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  revocations: MerchantRevocations;
  clock: { now(): Date };
}

// La tienda no tiene un comercio verificado: la capa HTTP lo traduce a 404.
export class MerchantNotVerifiedError extends Error {
  constructor() {
    super('La tienda no tiene un comercio verificado.');
    this.name = 'MerchantNotVerifiedError';
  }
}

// D3 del grill comercial: revocar retira todo lo que publicó el comercio al instante y la cuenta vuelve
// a reportante. Lo comparten la decisión de un caso y la revocación por iniciativa de moderación.
export async function revokeClaim(
  ports: Omit<RevokeMerchantPorts, 'claims'>,
  claim: MerchantClaim,
  note: string,
  moderatorKey: string,
): Promise<void> {
  const { accountId, establishmentId } = claim;
  await ports.revocations.revoke(
    {
      accountId,
      establishmentId,
      reason: note,
      moderatorKey,
      revokedAt: ports.clock.now(),
    },
    [
      createEvent(MERCHANT_REVOKED, 1, { accountId, establishmentId }),
      ...(await withdrawalEvents(establishmentId, ports.prices, ports.promotions)),
    ],
  );
}

// H14: moderación revoca a un comercio verificado por iniciativa propia, sin esperar un caso.
export class RevokeMerchant {
  constructor(private readonly ports: RevokeMerchantPorts) {}

  async execute(request: {
    establishmentId: string;
    note: string;
    // Clave seudónima del moderador (EC-08).
    moderatorKey: string;
  }): Promise<void> {
    const claim = await this.ports.claims.findByEstablishment(request.establishmentId);
    // Una solicitud preaprobada se decide en la cola de tiendas, no aquí.
    if (claim?.status !== 'verificado') throw new MerchantNotVerifiedError();
    await revokeClaim(this.ports, claim, request.note, request.moderatorKey);
  }
}
