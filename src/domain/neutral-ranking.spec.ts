import { rankOffers, type RankableOffer } from './neutral-ranking';
import { calculateUnitPrice, IncompatibleUnitsError, type Presentation } from './unit-price';

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

  describe('por distancia', () => {
    it('la tienda más cercana va primero y, a la misma distancia, la más barata por unidad', () => {
      const result = rankOffers(
        [
          offer({ store: 'cerca-cara', distanceMeters: 300, priceCop: 2500 }),
          offer({ store: 'lejos-barata', distanceMeters: 800, priceCop: 1800 }),
          offer({ store: 'cerca-media', distanceMeters: 300, priceCop: 2000 }),
        ],
        'distance',
      );

      expect(result.sort).toBe('distance');
      expect(storesOf(result.offers)).toEqual([
        'cerca-media/p-500g',
        'cerca-cara/p-500g',
        'lejos-barata/p-500g',
      ]);
    });
  });

  describe('por fecha', () => {
    it('el precio visto más recientemente va primero y, a la misma hora, el más barato por unidad', () => {
      const result = rankOffers(
        [
          offer({ store: 'viejo-barato', observedAt: '2026-11-11T09:00:00Z', priceCop: 1800 }),
          offer({ store: 'nuevo-caro', observedAt: '2026-11-12T10:00:00Z', priceCop: 2500 }),
          offer({ store: 'nuevo-medio', observedAt: '2026-11-12T10:00:00Z', priceCop: 2000 }),
        ],
        'recent',
      );

      expect(result.sort).toBe('recent');
      expect(storesOf(result.offers)).toEqual([
        'nuevo-medio/p-500g',
        'nuevo-caro/p-500g',
        'viejo-barato/p-500g',
      ]);
    });
  });

  it.each(['unit_price', 'distance', 'recent'] as const)(
    'rechaza ofertas por 100 g mezcladas con ofertas por unidad (orden %s)',
    (sort) => {
      const mixed = [
        offer({ store: 'por-gramos', distanceMeters: 300, observedAt: '2026-11-12T10:00:00Z' }),
        offer({
          store: 'por-unidad',
          presentation: { quantity: 1, unit: 'und' },
          presentationId: 'p-und',
          distanceMeters: 900,
          observedAt: '2026-11-12T07:00:00Z',
        }),
      ];

      expect(() => rankOffers(mixed, sort)).toThrow(IncompatibleUnitsError);
    },
  );

  describe('garantías', () => {
    const criteria = ['unit_price', 'distance', 'recent'] as const;

    it('dos precios que se muestran iguales ($412) se ordenan por su valor exacto', () => {
      // $2.062 / 500 g = $412,4 y $2.063 / 500 g = $412,6: ambos se muestran como $412.
      const result = rankOffers(
        [offer({ store: 'a-412-6', priceCop: 2063 }), offer({ store: 'b-412-4', priceCop: 2062 })],
        'unit_price',
      );

      expect(storesOf(result.offers)).toEqual(['b-412-4/p-500g', 'a-412-6/p-500g']);
    });

    it('sin ofertas devuelve la lista vacía y el criterio usado', () => {
      expect(rankOffers([], 'distance')).toEqual({ sort: 'distance', offers: [] });
    });

    it('no cambia la lista que recibe', () => {
      const received = [offer({ store: 'cara', priceCop: 2500 }), offer({ store: 'barata' })];
      const before = [...received];

      rankOffers(received, 'unit_price');

      expect(received).toEqual(before);
    });

    it.each(criteria)(
      'una promoción o un perfil comercial no cambian el puesto de una tienda (orden %s)',
      (sort) => {
        const neutral = [
          offer({ store: 'cerca-cara', priceCop: 2500, distanceMeters: 200 }),
          offer({ store: 'media', priceCop: 2000, observedAt: '2026-11-12T11:00:00Z' }),
          offer({ store: 'lejos-barata', priceCop: 1800, distanceMeters: 2000 }),
        ];
        // La oferta más cara por unidad recibe todo lo que un comercio podría querer usar para subir.
        const withCommercialFields = neutral.map((plain) =>
          plain.establishmentId === 'cerca-cara'
            ? {
                ...plain,
                promotion: { type: 'precio_especial', specialPriceCop: 100 },
                verifiedCommerce: true,
                paidPlacement: true,
              }
            : plain,
        );

        expect(storesOf(rankOffers(withCommercialFields, sort).offers)).toEqual(
          storesOf(rankOffers(neutral, sort).offers),
        );
      },
    );

    // Todas las formas de ordenar una lista (5 elementos: 120 permutaciones).
    function permutations<T>(items: readonly T[]): T[][] {
      if (items.length <= 1) return [[...items]];
      return items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
          item,
          ...rest,
        ]),
      );
    }

    it.each(criteria)(
      'las mismas ofertas dan el mismo orden sin importar cómo lleguen (orden %s)',
      (sort) => {
        // Empates escalonados: mismo precio; mismo precio y distancia; todo igual salvo el identificador.
        const offers = [
          offer({ store: 'tienda-1', priceCop: 1800 }),
          offer({ store: 'tienda-2', distanceMeters: 500 }),
          offer({ store: 'tienda-3', distanceMeters: 500, observedAt: '2026-11-12T09:00:00Z' }),
          offer({ store: 'tienda-5' }),
          offer({ store: 'tienda-4' }),
        ];
        const expected = storesOf(rankOffers(offers, sort).offers);
        const orders = permutations(offers);

        expect(orders).toHaveLength(120);
        for (const order of orders) {
          expect(storesOf(rankOffers(order, sort).offers)).toEqual(expected);
        }
      },
    );
  });
});
