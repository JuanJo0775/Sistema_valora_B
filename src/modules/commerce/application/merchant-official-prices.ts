import { type Freshness, freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPrice, OfficialPriceRepository } from './official-prices';
import { MerchantNotVerifiedError } from './publish-official-price';

export interface MerchantOfficialPricesPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'listFor'>;
  // La categoría de la presentación, por la interfaz pública de catalog (ADR-005).
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  clock: { now(): Date };
}

export interface OfficialPriceView extends OfficialPrice {
  freshness: Freshness;
}

// D4 del grill comercial: el oficial vale lo mismo que un reporte (ADR-005), contando desde la
// última confirmación.
export class MerchantOfficialPrices {
  constructor(private readonly ports: MerchantOfficialPricesPorts) {}

  async execute(accountId: string): Promise<OfficialPriceView[]> {
    const { claims, prices, presentations, clock } = this.ports;
    const claim = await claims.findByAccount(accountId);
    if (claim?.status !== 'verificado') throw new MerchantNotVerifiedError();
    const now = clock.now();
    const stored = await prices.listFor(claim.establishmentId);
    return Promise.all(
      stored.map(async (price) => ({
        ...price,
        freshness: freshnessOf({
          observedAt: price.confirmedAt,
          now,
          ttlDays: ttlDaysFor((await presentations.isFresh(price.presentationId)) ?? false),
        }),
      })),
    );
  }
}
