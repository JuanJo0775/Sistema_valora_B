import { type Freshness, freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import type { MerchantClaimRepository } from './merchant-claims';
import type { OfficialPrice, OfficialPriceRepository } from './official-prices';
import {
  describePresentations,
  type PresentationDescription,
  type PresentationNamesPort,
} from './presentation-description';
import { verifiedEstablishmentOf } from './publish-official-price';

export interface MerchantOfficialPricesPorts {
  claims: Pick<MerchantClaimRepository, 'findByAccount'>;
  prices: Pick<OfficialPriceRepository, 'listFor' | 'listReviewsFor'>;
  // La categoría de la presentación, por la interfaz pública de catalog (ADR-005).
  presentations: { isFresh(presentationId: string): Promise<boolean | null> };
  // H3: el nombre y la etiqueta, por la interfaz pública de catalog.
  names: PresentationNamesPort;
  clock: { now(): Date };
}

export interface OfficialPriceView extends OfficialPrice, PresentationDescription {
  freshness: Freshness;
}

// ADR-037: un precio enviado que espera la decisión de moderación; todavía no es el oficial.
export interface OfficialPriceInReview extends PresentationDescription {
  presentationId: string;
  priceCop: number;
  submittedAt: Date;
  status: 'en_revision';
}

export interface MerchantPriceList {
  items: OfficialPriceView[];
  inReview: OfficialPriceInReview[];
}

// D4 del grill comercial: el oficial vale lo mismo que un reporte (ADR-005), contando desde la
// última confirmación.
export class MerchantOfficialPrices {
  constructor(private readonly ports: MerchantOfficialPricesPorts) {}

  async execute(accountId: string): Promise<MerchantPriceList> {
    const { claims, prices, presentations, names, clock } = this.ports;
    const establishmentId = await verifiedEstablishmentOf(claims, accountId);
    const now = clock.now();
    const [stored, reviews] = await Promise.all([
      prices.listFor(establishmentId),
      prices.listReviewsFor(establishmentId),
    ]);
    const describe = await describePresentations(
      names,
      [...stored, ...reviews].map((entry) => entry.presentationId),
    );
    const items = await Promise.all(
      stored.map(async (price) => ({
        ...price,
        ...describe(price.presentationId),
        freshness: freshnessOf({
          observedAt: price.confirmedAt,
          now,
          ttlDays: ttlDaysFor((await presentations.isFresh(price.presentationId)) ?? false),
        }),
      })),
    );
    return {
      items,
      inReview: reviews.map(({ presentationId, priceCop, submittedAt }) => ({
        presentationId,
        ...describe(presentationId),
        priceCop,
        submittedAt,
        status: 'en_revision' as const,
      })),
    };
  }
}
