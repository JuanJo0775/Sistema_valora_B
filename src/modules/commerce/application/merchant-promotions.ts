import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPriceRepository } from './official-prices';
import { describePresentations, type PresentationNamesPort } from './presentation-description';
import { type MerchantPromotionView, type PromotionRepository, promotionView } from './promotions';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface MerchantPromotionsPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  promotions: Pick<PromotionRepository, 'listFor'>;
  prices: Pick<OfficialPriceRepository, 'findOne'>;
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  // H3: el nombre y la etiqueta, por la interfaz pública de catalog.
  names: PresentationNamesPort;
  clock: { now(): Date };
}

// D6: las promociones del comercio con su estado de hoy; reconfirmar el oficial reactiva las pausadas.
export class MerchantPromotions {
  constructor(private readonly ports: MerchantPromotionsPorts) {}

  async execute(accountId: string): Promise<MerchantPromotionView[]> {
    const { claims, promotions, prices, presentations, names, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const now = clock.now();
    const stored = await promotions.listFor(establishmentId);
    const describe = await describePresentations(
      names,
      stored.map((promotion) => promotion.presentationId),
    );
    return Promise.all(
      stored.map(async (promotion) => ({
        ...promotionView(
          promotion,
          await prices.findOne(establishmentId, promotion.presentationId),
          (await presentations.isFresh(promotion.presentationId)) ?? false,
          now,
        ),
        ...describe(promotion.presentationId),
      })),
    );
  }
}
