import type { ProductForComparison } from '../../catalog';
import type { OlimpicaObservations } from '../infrastructure/olimpica-observations';

export const ONLINE_OFFERS_ENABLED = Symbol('ONLINE_OFFERS_ENABLED');

export class ListOnlineOffers {
  constructor(
    private readonly catalog: ProductForComparison,
    private readonly observations: Pick<OlimpicaObservations, 'current'>,
    private readonly enabled: () => boolean,
  ) {}

  async execute(productId: string, zone: 'armenia-centro', now: Date) {
    const product = await this.catalog.find(productId);
    if (!product) return null;
    if (!this.enabled()) return [];
    const offers = await Promise.all(
      product.presentations.map(({ id }) => this.observations.current(id, zone, now)),
    );
    return offers.flatMap((offer) =>
      offer?.status === 'available'
        ? [
            {
              presentationId: offer.presentationId,
              source: 'olimpica' as const,
              zone,
              priceCop: offer.priceCop,
              observedAt: offer.observedAt.toISOString(),
              expiresAt: offer.expiresAt.toISOString(),
            },
          ]
        : [],
    );
  }
}
