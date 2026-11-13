import type { NearbyEstablishment } from '../../establishments';
import { CompareProduct, type CompareProductInput } from './compare-product';
import type { CurrentPrice } from './current-prices';

const productId = '11111111-1111-4111-8111-111111111111';
const missingId = '99999999-9999-4999-8999-999999999999';
const now = new Date('2026-11-12T14:00:00Z');

interface Fixture {
  isFresh?: boolean;
  prices?: CurrentPrice[];
  stores?: NearbyEstablishment[];
}

// Dobles de los cuatro puertos: el catálogo, las tiendas, price_current y el reloj.
function setup({ isFresh = false, prices = [], stores = [] }: Fixture = {}) {
  return new CompareProduct({
    products: {
      find: (id) =>
        Promise.resolve(
          id === productId
            ? {
                id,
                isFresh,
                presentations: [{ id: 'p-500g', quantity: 500, unit: 'g' as const, packCount: 1 }],
              }
            : null,
        ),
    },
    stores: {
      find: ({ ids }) => Promise.resolve(stores.filter((store) => ids.includes(store.id))),
    },
    prices: {
      findByPresentations: (ids) =>
        Promise.resolve(prices.filter((price) => ids.includes(price.presentationId))),
    },
    clock: { now: () => now },
  });
}

const input = (change: Partial<CompareProductInput> = {}): CompareProductInput => ({
  productId,
  lat: 4.5339,
  lng: -75.6811,
  radiusKm: 2,
  sort: 'unit_price',
  onlyCurrent: false,
  ...change,
});

describe('comparar los precios de un producto', () => {
  it('un producto que no existe no tiene comparación', async () => {
    await expect(setup().execute(input({ productId: missingId }))).resolves.toBeNull();
  });

  it('un producto sin precios devuelve resultados y promociones vacíos, con el criterio declarado', async () => {
    await expect(setup().execute(input({ sort: 'distance', radiusKm: 1.5 }))).resolves.toEqual({
      productId,
      criteria: { sort: 'distance', radiusKm: 1.5 },
      results: [],
      promotions: [],
    });
  });
});
