import { createEvent } from '../../../shared/events';
import type { MerchantClaimRepository } from './merchant-claims';
import { OFFICIAL_PRICES_RECONFIRMED, type OfficialPriceRepository } from './official-prices';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface ReconfirmOfficialPricesPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'reconfirmAll'>;
  clock: { now(): Date };
}

// D4 del grill comercial: botón «Todos mis precios siguen igual». Con 1.000 productos es un toque.
export class ReconfirmOfficialPrices {
  constructor(private readonly ports: ReconfirmOfficialPricesPorts) {}

  async execute(accountId: string): Promise<{ reconfirmed: number }> {
    const { claims, prices, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const at = clock.now();
    const reconfirmed = await prices.reconfirmAll(establishmentId, at, [
      createEvent(OFFICIAL_PRICES_RECONFIRMED, 1, {
        establishmentId,
        confirmedAt: at.toISOString(),
      }),
    ]);
    return { reconfirmed };
  }
}
