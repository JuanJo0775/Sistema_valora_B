import { createEvent } from '../../../shared/events';
import {
  OFFICIAL_PRICE_PUBLISHED,
  type OfficialPrice,
  type OfficialPriceRepository,
} from './official-prices';

// Datos de OfficialPriceReviewed versión 1 (reliability, ADR-037): lo que moderación decidió.
export interface OfficialPriceReviewedV1 {
  reviewId: string;
  establishmentId: string;
  presentationId: string;
  decision: 'aprobado' | 'descartado';
}

export interface ApplyOfficialPriceReviewPorts {
  prices: Pick<OfficialPriceRepository, 'save' | 'takeReview'>;
  clock: { now(): Date };
}

// ADR-037: al decidir moderación un precio oficial que estaba en revisión, aprobar lo vuelve el
// oficial vigente de la tienda (confirmado ahora, como si lo publicara en ese momento) y descartar lo
// retira. Si la revisión ya no existe (otro precio la reemplazó, o se retiró la tienda), no hace nada.
export class ApplyOfficialPriceReview {
  constructor(private readonly ports: ApplyOfficialPriceReviewPorts) {}

  async execute(decided: OfficialPriceReviewedV1): Promise<void> {
    const { prices, clock } = this.ports;
    const review = await prices.takeReview(
      decided.establishmentId,
      decided.presentationId,
      decided.reviewId,
    );
    if (!review || decided.decision !== 'aprobado') return;
    const price: OfficialPrice = {
      establishmentId: review.establishmentId,
      presentationId: review.presentationId,
      priceCop: review.priceCop,
      confirmedAt: clock.now(),
    };
    await prices.save(price, [
      createEvent(OFFICIAL_PRICE_PUBLISHED, 1, {
        ...price,
        confirmedAt: price.confirmedAt.toISOString(),
      }),
    ]);
  }
}
