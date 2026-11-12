import { rankOffers, type RankableOffer } from './neutral-ranking';
import { calculateUnitPrice, type Presentation } from './unit-price';

const halfKilo: Presentation = { quantity: 500, unit: 'g' };

interface OfferData {
  store: string;
  priceCop?: number;
  presentation?: Presentation;
  distanceMeters?: number;
  observedAt?: string;
  presentationId?: string;
}

// Oferta de prueba: por defecto, 500 g a $2.000, a 1 km y vista el 12 de noviembre a las 8:00.
function offer({
  store,
  priceCop = 2000,
  presentation = halfKilo,
  distanceMeters = 1000,
  observedAt = '2026-11-12T08:00:00Z',
  presentationId = 'p-500g',
}: OfferData): RankableOffer {
  return {
    establishmentId: store,
    presentationId,
    unitPrice: calculateUnitPrice(priceCop, presentation),
    distanceMeters,
    observedAt: new Date(observedAt),
  };
}

const storesOf = (offers: readonly RankableOffer[]) =>
  offers.map((ranked) => `${ranked.establishmentId}/${ranked.presentationId}`);

describe('orden neutral de la comparación', () => {
  describe('por precio por unidad', () => {
    it('la tienda más barata por 100 g va primero, y el resultado dice que usó unit_price', () => {
      const result = rankOffers(
        [
          offer({ store: 'tienda-cara', priceCop: 2500 }),
          offer({ store: 'tienda-barata', priceCop: 1800 }),
          offer({ store: 'tienda-media', priceCop: 2000 }),
        ],
        'unit_price',
      );

      expect(result.sort).toBe('unit_price');
      expect(storesOf(result.offers)).toEqual([
        'tienda-barata/p-500g',
        'tienda-media/p-500g',
        'tienda-cara/p-500g',
      ]);
    });
  });
});
