import { createEvent, type DomainEvent } from '../../../shared/events';
import type { OfficialPriceRepository } from './official-prices';
import { PROMOTION_WITHDRAWN, type PromotionRepository } from './promotions';

export const OFFICIAL_PRICE_WITHDRAWN = 'OfficialPriceWithdrawn';

// D3 (#208): al revocar un comercio o borrar su cuenta, todo lo que publicó deja de mostrarse al
// instante; la comparación vuelve a los reportes y datos iniciales.
export async function withdrawalEvents(
  establishmentId: string,
  prices: Pick<OfficialPriceRepository, 'listFor'>,
  promotions: Pick<PromotionRepository, 'listFor'>,
): Promise<DomainEvent[]> {
  return [
    ...(await prices.listFor(establishmentId)).map(({ presentationId }) =>
      createEvent(OFFICIAL_PRICE_WITHDRAWN, 1, { establishmentId, presentationId }),
    ),
    ...(await promotions.listFor(establishmentId)).map(({ id, presentationId }) =>
      createEvent(PROMOTION_WITHDRAWN, 1, { id, establishmentId, presentationId }),
    ),
  ];
}
