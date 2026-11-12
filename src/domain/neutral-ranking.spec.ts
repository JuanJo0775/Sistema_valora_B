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

    it('con el mismo precio por unidad, va primero la tienda más cercana', () => {
      const result = rankOffers(
        [
          offer({ store: 'tienda-lejana', distanceMeters: 2500 }),
          // 1 kg a $4.000 equivale a 500 g a $2.000: el mismo precio por 100 g.
          offer({
            store: 'tienda-cercana',
            priceCop: 4000,
            presentation: { quantity: 1, unit: 'kg' },
            presentationId: 'p-1kg',
            distanceMeters: 300,
          }),
        ],
        'unit_price',
      );

      expect(storesOf(result.offers)).toEqual(['tienda-cercana/p-1kg', 'tienda-lejana/p-500g']);
    });

    it('con el mismo precio y la misma distancia, va primero el precio visto más recientemente', () => {
      const result = rankOffers(
        [
          offer({ store: 'visto-temprano', observedAt: '2026-11-12T07:00:00Z' }),
          offer({ store: 'visto-tarde', observedAt: '2026-11-12T11:00:00Z' }),
        ],
        'unit_price',
      );

      expect(storesOf(result.offers)).toEqual(['visto-tarde/p-500g', 'visto-temprano/p-500g']);
    });

    it('si todo empata, decide el identificador de la tienda y luego el de la presentación, carácter por carácter', () => {
      const result = rankOffers(
        [
          offer({ store: 'tienda-b', presentationId: 'p-2' }),
          offer({ store: 'tienda-b', presentationId: 'p-1' }),
          offer({ store: 'tienda-a', presentationId: 'p-1' }),
          // Carácter por carácter, la «T» mayúscula va antes que la «t» minúscula.
          offer({ store: 'Tienda-c', presentationId: 'p-1' }),
        ],
        'unit_price',
      );

      expect(storesOf(result.offers)).toEqual([
        'Tienda-c/p-1',
        'tienda-a/p-1',
        'tienda-b/p-1',
        'tienda-b/p-2',
      ]);
    });
  });
});
