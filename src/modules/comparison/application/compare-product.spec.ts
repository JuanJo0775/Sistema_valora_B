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

// Tienda de prueba a la distancia indicada del punto consultado.
const store = (id: string, distanceM = 500): NearbyEstablishment => ({
  id,
  name: `Tienda ${id}`,
  type: 'barrio',
  lat: 4.535,
  lng: -75.6811,
  distanceM,
});

// Precio de 500 g, por defecto $2.000 visto hace un día.
const price = (establishmentId: string, priceCop = 2000, daysAgo = 1): CurrentPrice => ({
  presentationId: 'p-500g',
  establishmentId,
  priceCop,
  observedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
});

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

  it('un precio se muestra con su tienda, precio total, precio por unidad, fuente, fecha y vigencia', async () => {
    const reported = price('t1', 2000, 1);
    const compare = setup({ prices: [reported], stores: [store('t1', 420)] });

    const comparison = await compare.execute(input());

    const [item] = comparison?.results ?? [];
    expect(item).toMatchObject({
      establishment: store('t1', 420),
      presentationId: 'p-500g',
      priceCop: 2000,
      source: 'comunidad',
      freshness: 'vigente',
      observedAt: reported.observedAt,
    });
    // 500 g a $2.000 equivale a $400 por 100 g.
    expect(item?.unitPrice.per).toBe('100g');
    expect(item?.unitPrice.displayCop).toBe(400);
  });

  it('un precio de una tienda fuera del radio no aparece', async () => {
    // El doble de las tiendas solo conoce t1: t2 está fuera del radio.
    const compare = setup({ prices: [price('t1'), price('t2', 1500)], stores: [store('t1')] });

    const comparison = await compare.execute(input());

    expect(comparison?.results.map((item) => item.establishment.id)).toEqual(['t1']);
  });

  it('la vigencia usa el TTL de la categoría: a los 10 días, lo fresco está por confirmar y lo demás sigue vigente', async () => {
    const tenDaysOld = { prices: [price('t1', 2000, 10)], stores: [store('t1')] };

    const fresh = await setup({ ...tenDaysOld, isFresh: true }).execute(input());
    const notFresh = await setup({ ...tenDaysOld, isFresh: false }).execute(input());

    expect(fresh?.results[0]?.freshness).toBe('por_confirmar');
    expect(notFresh?.results[0]?.freshness).toBe('vigente');
  });

  it('un precio visto unos minutos «en el futuro» (margen de relojes de la #14) cuenta como vigente', async () => {
    const threeMinutesAhead = {
      ...price('t1'),
      observedAt: new Date(now.getTime() + 3 * 60 * 1000),
    };
    const compare = setup({ prices: [threeMinutesAhead], stores: [store('t1')] });

    const comparison = await compare.execute(input());

    expect(comparison?.results[0]?.freshness).toBe('vigente');
  });
});
