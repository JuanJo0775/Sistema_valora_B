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
  // Lo que reliability calcula para cada tienda (#31); por defecto, media sin confirmaciones.
  reliability?: Record<string, { level: 'alta' | 'media' | 'baja'; confirmations: number }>;
}

// Dobles de los puertos: el catálogo, las tiendas, price_current, reliability y el reloj.
function setup({ isFresh = false, prices = [], stores = [], reliability = {} }: Fixture = {}) {
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
    reliability: {
      of: (refs) =>
        Promise.resolve(
          refs.map((ref) => ({
            ...ref,
            ...(reliability[ref.establishmentId] ?? { level: 'media' as const, confirmations: 0 }),
          })),
        ),
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
  reportId: `reporte-${establishmentId}`,
  presentationId: 'p-500g',
  establishmentId,
  priceCop,
  status: 'vigente',
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

  it('un precio se muestra con su tienda, su reporte, precio total, precio por unidad, fuente, fecha y vigencia', async () => {
    const reported = price('t1', 2000, 1);
    const compare = setup({ prices: [reported], stores: [store('t1', 420)] });

    const comparison = await compare.execute(input());

    const [item] = comparison?.results ?? [];
    expect(item).toMatchObject({
      establishment: store('t1', 420),
      // Grill de la #32, pregunta 3: el reporte que se muestra, para poder marcarlo.
      reportId: 'reporte-t1',
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

  // Granos y abarrotes (TTL de 14 días): a los 40 días un precio está desactualizado.
  const mixedAges = {
    prices: [
      price('viejo-medio', 1200, 40),
      price('nuevo-caro', 2500, 1),
      price('viejo-barato', 1000, 40),
      price('nuevo-barato', 2000, 1),
    ],
    stores: ['viejo-medio', 'nuevo-caro', 'viejo-barato', 'nuevo-barato'].map((id) => store(id)),
  };
  const idsOf = (comparison: Awaited<ReturnType<CompareProduct['execute']>>) =>
    comparison?.results.map((item) => item.establishment.id);

  it('los desactualizados van al final, ordenados entre sí con el mismo criterio', async () => {
    const comparison = await setup(mixedAges).execute(input());

    expect(idsOf(comparison)).toEqual([
      'nuevo-barato',
      'nuevo-caro',
      'viejo-barato',
      'viejo-medio',
    ]);
  });

  it('con onlyCurrent solo quedan los precios vigentes', async () => {
    // A los 20 días (TTL de 14) un precio está por confirmar.
    const withPending = {
      prices: [...mixedAges.prices, price('por-confirmar', 1500, 20)],
      stores: [...mixedAges.stores, store('por-confirmar')],
    };

    const comparison = await setup(withPending).execute(input({ onlyCurrent: true }));

    expect(idsOf(comparison)).toEqual(['nuevo-barato', 'nuevo-caro']);
  });

  it('isCheapest marca los precios más bajos por unidad entre los no desactualizados, también si empatan', async () => {
    const withTie = {
      prices: [...mixedAges.prices, price('empate-barato', 2000, 2)],
      stores: [...mixedAges.stores, store('empate-barato')],
    };

    const comparison = await setup(withTie).execute(input());

    // viejo-barato es el más barato de todos, pero está desactualizado.
    expect(
      Object.fromEntries(
        comparison?.results.map((item) => [item.establishment.id, item.isCheapest]) ?? [],
      ),
    ).toEqual({
      'nuevo-barato': true,
      'empate-barato': true,
      'nuevo-caro': false,
      'viejo-barato': false,
      'viejo-medio': false,
    });
  });

  it('el orden sigue el criterio pedido: por distancia, la tienda más cercana va primero', async () => {
    const compare = setup({
      prices: [price('lejos-barata', 1500), price('cerca-cara', 2500)],
      stores: [store('lejos-barata', 1800), store('cerca-cara', 150)],
    });

    const comparison = await compare.execute(input({ sort: 'distance' }));

    expect(comparison?.criteria.sort).toBe('distance');
    expect(idsOf(comparison)).toEqual(['cerca-cara', 'lejos-barata']);
  });

  // Grill de la #31, preguntas 5 y 6.
  it('cada resultado muestra la confiabilidad y las confirmaciones que calcula reliability', async () => {
    const compare = setup({
      prices: [price('t1')],
      stores: [store('t1')],
      reliability: { t1: { level: 'alta', confirmations: 2 } },
    });

    const comparison = await compare.execute(input());

    expect(comparison?.results[0]).toMatchObject({ reliability: 'alta', confirmations: 2 });
  });

  it('un precio en revisión va al final con reliability en_revision, nunca es el más barato y onlyCurrent lo quita', async () => {
    const compare = setup({
      prices: [price('normal', 2000), { ...price('dudoso', 900), status: 'en_revision' }],
      stores: [store('normal'), store('dudoso')],
    });

    const comparison = await compare.execute(input());
    const onlyCurrent = await compare.execute(input({ onlyCurrent: true }));

    expect(
      comparison?.results.map((item) => [item.establishment.id, item.reliability, item.isCheapest]),
    ).toEqual([
      ['normal', 'media', true],
      ['dudoso', 'en_revision', false],
    ]);
    expect(onlyCurrent?.results.map((item) => item.establishment.id)).toEqual(['normal']);
  });
});
