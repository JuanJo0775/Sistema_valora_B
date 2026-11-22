import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import { type PromotionRepository, type PromotionView, promotionView } from './promotions';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface MerchantPromotionsPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  prices: Pick<OfficialPriceRepository, 'findOne'>;
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  clock: { now(): Date };
}

// D6: las promociones del comercio con su estado de hoy; reconfirmar el oficial reactiva las pausadas.
export class MerchantPromotions {
  constructor(private readonly ports: MerchantPromotionsPorts) {}

  async execute(accountId: string): Promise<PromotionView[]> {
    const { claims, promotions, prices, presentations, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const now = clock.now();
    const stored = await promotions.listFor(establishmentId);
    return Promise.all(
      stored.map(async (promotion) =>
        promotionView(
          promotion,
          await prices.findOne(establishmentId, promotion.presentationId),
          (await presentations.isFresh(promotion.presentationId)) ?? false,
          now,
        ),
      ),
    );
  }
}
