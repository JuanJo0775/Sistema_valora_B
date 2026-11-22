import type { PresentationForPricing, ProductSummaryView } from '../../catalog';
import type {
  EstablishmentDetail,
  InMunicipalityQuery,
  WithinRadiusQuery,
} from '../../establishments';
import { MissingAreaError } from './compare-product';
import type { CurrentPrice } from './current-prices';
import { FeaturedProducts } from './featured-products';
import type { OfficialPriceCopy } from './official-price-copies';
import type { StoreReports } from './official-resolution';

const now = new Date('2026-11-16T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const shop = (id: string, name: string, municipality = 'armenia'): EstablishmentDetail => ({
  id,
  name,
  type: 'barrio',
  lat: 4.535,
  lng: -75.6811,
  municipality: municipality as EstablishmentDetail['municipality'],
});
const donJose = shop('tienda-1', 'Tienda Don José');
const ara = shop('tienda-2', 'Ara Centro');
const exito = shop('tienda-3', 'Éxito Calarcá', 'calarca');

const presentation = (
  productId: string,
  label: string,
  change: Partial<PresentationForPricing> = {},
): PresentationForPricing => ({
  productId,
  label,
  quantity: 500,
  unit: 'g',
  packCount: 1,
  isFresh: false,
  ...change,
});

const presentations = new Map([
  ['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')],
  ['arroz-1kg', presentation('arroz', 'Arroz Diana · 1 kg', { quantity: 1, unit: 'kg' })],
  ['leche-1l', presentation('leche', 'Leche Colanta · 1 l', { quantity: 1, unit: 'l' })],
]);

const summaries = new Map<string, ProductSummaryView>([
  [
    'arroz',
    {
      id: 'arroz',
      name: 'Arroz',
      brand: 'Diana',
      category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
      image: {
        url: 'https://images.openfoodfacts.org/arroz.jpg',
        source: 'open_food_facts',
        attribution: 'Open Food Facts, CC BY-SA',
      },
    },
  ],
  [
    'leche',
    {
      id: 'leche',
      name: 'Leche entera',
      brand: 'Colanta',
      category: { code: 'dairy-eggs', name: 'Lácteos y huevos' },
    },
  ],
]);

const price = (
  presentationId: string,
  establishmentId: string,
  priceCop: number,
  change: Partial<CurrentPrice> = {},
): CurrentPrice => ({
  reportId: `reporte-${presentationId}-${establishmentId}`,
  source: 'comunidad',
  presentationId,
  establishmentId,
  priceCop,
  observedAt: hoursAgo(2),
  status: 'vigente',
  ...change,
});

// Distancia de cada tienda a la ubicación de prueba; las que no están, quedan fuera del radio.
const distances = new Map([
  [donJose.id, 350],
  [ara.id, 900],
]);

function setup(
  prices: CurrentPrice[],
  asked: WithinRadiusQuery[] = [],
  officials: OfficialPriceCopy[] = [],
  reliability: StoreReports = { reportsAt: () => Promise.resolve([]) },
) {
  const stores = [donJose, ara, exito];
  return new FeaturedProducts({
    prices: { findAll: () => Promise.resolve(prices) },
    officials: { findAll: () => Promise.resolve(officials) },
    reliability,
    stores: {
      find: (query: WithinRadiusQuery) => {
        asked.push(query);
        return Promise.resolve(
          stores.flatMap((store) => {
            const distanceM = distances.get(store.id);
            return query.ids.includes(store.id) && distanceM !== undefined
              ? [{ ...store, distanceM }]
              : [];
          }),
        );
      },
      findInMunicipality: ({ ids, municipality }: InMunicipalityQuery) =>
        Promise.resolve(
          stores.filter((store) => ids.includes(store.id) && store.municipality === municipality),
        ),
    },
    presentations: {
      of: (ids) => Promise.resolve(new Map([...presentations].filter(([id]) => ids.includes(id)))),
    },
    products: {
      of: (ids) => Promise.resolve(new Map([...summaries].filter(([id]) => ids.includes(id)))),
    },
    clock: { now: () => now },
  });
}

describe('canasta básica de hoy en un municipio (B#120)', () => {
  it('cada producto dice cuántas tiendas del municipio tienen precio y dónde está el más bajo por unidad', async () => {
    const featured = setup([
      price('arroz-500g', donJose.id, 2500),
      // 1 kg a $4.400 es $440 por 100 g: más barato que 500 g a $2.500 ($500 por 100 g).
      price('arroz-1kg', ara.id, 4400),
      price('leche-1l', donJose.id, 4800),
      // Calarcá no es Armenia: ni cuenta ni compite.
      price('arroz-500g', exito.id, 1000),
    ]);

    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.criteria).toEqual({ municipality: 'armenia', sort: 'store_count' });
    expect(result.items.map(({ productId }) => productId)).toEqual(['arroz', 'leche']);
    const [arroz] = result.items;
    expect(arroz).toMatchObject({
      productId: 'arroz',
      name: 'Arroz',
      brand: 'Diana',
      category: { code: 'grains-groceries', name: 'Granos y abarrotes' },
      storeCount: 2,
      cheapest: {
        presentationId: 'arroz-1kg',
        label: 'Arroz Diana · 1 kg',
        priceCop: 4400,
        establishment: { id: ara.id, name: 'Ara Centro' },
      },
    });
    expect(arroz?.cheapest.unitPrice).toMatchObject({ per: '100g', displayCop: 440 });
  });

  it('solo cuentan los precios vigentes: ni por confirmar, ni desactualizados, ni en revisión', async () => {
    const featured = setup([
      price('arroz-500g', donJose.id, 2500),
      // El arroz no es fresco: 14 días de vigencia. A los 20 días está por confirmar.
      price('arroz-1kg', ara.id, 3000, { observedAt: hoursAgo(20 * 24) }),
      price('leche-1l', donJose.id, 4800, { status: 'en_revision' }),
      price('leche-1l', ara.id, 4500, {
        // 30 días: más de dos veces la vigencia, desactualizado.
        observedAt: hoursAgo(30 * 24),
      }),
    ]);

    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: 'arroz',
      storeCount: 1,
      cheapest: { presentationId: 'arroz-500g', priceCop: 2500 },
    });
  });
});

describe('canasta básica de hoy cerca de ti, por categoría y con el ahorro (B#128)', () => {
  const near = { lat: 4.5339, lng: -75.6811, radiusKm: 1.5 };

  it('con la ubicación cuentan solo las tiendas del radio y la más barata dice a qué distancia está', async () => {
    const asked: WithinRadiusQuery[] = [];
    const featured = setup(
      [
        price('arroz-500g', donJose.id, 2500),
        price('arroz-1kg', ara.id, 4400),
        // Fuera del radio: aunque es más barato, no cuenta.
        price('arroz-500g', exito.id, 1000),
      ],
      asked,
    );

    const result = await featured.of({ ...near, limit: 5 });

    expect(result.criteria).toEqual({ radiusKm: 1.5, sort: 'store_count' });
    expect(asked[0]).toMatchObject({ lat: 4.5339, lng: -75.6811, radiusMeters: 1500 });
    expect(result.items[0]).toMatchObject({
      storeCount: 2,
      cheapest: { establishment: { id: ara.id, name: 'Ara Centro', distanceM: 900 } },
    });
  });

  it('con la ubicación y el municipio, el radio solo mira ese municipio', async () => {
    const asked: WithinRadiusQuery[] = [];
    const featured = setup([price('arroz-500g', donJose.id, 2500)], asked);

    const result = await featured.of({ ...near, municipality: 'armenia', limit: 5 });

    expect(asked[0]?.municipality).toBe('armenia');
    expect(result.criteria).toEqual({
      municipality: 'armenia',
      radiusKm: 1.5,
      sort: 'store_count',
    });
  });

  it('sin ubicación ni municipio no sabe qué tiendas mirar', async () => {
    const featured = setup([]);

    await expect(featured.of({ radiusKm: 1.5, limit: 5 })).rejects.toThrow(MissingAreaError);
  });

  it('sin ubicación la tienda más barata no trae distancia', async () => {
    const featured = setup([price('arroz-500g', donJose.id, 2500)]);

    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.items[0]?.cheapest.establishment).toEqual({
      id: donJose.id,
      name: 'Tienda Don José',
    });
  });

  it('con una categoría, solo los productos de esa categoría', async () => {
    const featured = setup([
      price('arroz-500g', donJose.id, 2500),
      price('arroz-500g', ara.id, 2600),
      price('leche-1l', donJose.id, 4800),
    ]);

    const result = await featured.of({
      municipality: 'armenia',
      radiusKm: 1.5,
      category: 'dairy-eggs',
      limit: 5,
    });

    expect(result.items.map(({ productId }) => productId)).toEqual(['leche']);
    expect(result.criteria).toEqual({
      municipality: 'armenia',
      category: 'dairy-eggs',
      sort: 'store_count',
    });
  });

  it('dice cuánto menos cuesta el más barato que el más caro, y cuál es el más caro', async () => {
    const featured = setup([
      // $500 por 100 g frente a $440 por 100 g: 12 % menos.
      price('arroz-500g', donJose.id, 2500),
      price('arroz-1kg', ara.id, 4400),
      price('leche-1l', donJose.id, 4800),
    ]);

    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    const [arroz, leche] = result.items;
    expect(arroz?.savingsPercent).toBe(12);
    expect(arroz?.priciest).toMatchObject({
      presentationId: 'arroz-500g',
      label: 'Arroz Diana · 500 g',
      priceCop: 2500,
      establishment: { id: donJose.id, name: 'Tienda Don José' },
    });
    // Una sola tienda: no hay con qué comparar.
    expect(leche).not.toHaveProperty('savingsPercent');
    expect(leche).not.toHaveProperty('priciest');
  });

  it('dice cuántas tiendas del área tienen algún precio vigente, de cualquier categoría', async () => {
    const featured = setup([
      price('arroz-500g', donJose.id, 2500),
      price('leche-1l', ara.id, 4800),
      price('leche-1l', donJose.id, 4700, { status: 'en_revision' }),
      // Calarcá no es Armenia.
      price('arroz-500g', exito.id, 1000),
    ]);

    const result = await featured.of({
      municipality: 'armenia',
      radiusKm: 1.5,
      category: 'dairy-eggs',
      limit: 5,
    });

    expect(result.storesWithPrices).toBe(2);
  });
});

describe('imagen del producto en la canasta básica', () => {
  it('cada ítem trae la imagen del producto cuando la tiene y sale sin image cuando no', async () => {
    const featured = setup([
      price('arroz-500g', donJose.id, 2500),
      price('leche-1l', donJose.id, 4800),
    ]);

    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    const byId = new Map(result.items.map((item) => [item.productId, item]));
    expect(byId.get('arroz')?.image).toEqual({
      url: 'https://images.openfoodfacts.org/arroz.jpg',
      source: 'open_food_facts',
      attribution: 'Open Food Facts, CC BY-SA',
    });
    expect(byId.get('leche')).not.toHaveProperty('image');
  });
});

describe('precio efectivo en la canasta (#218)', () => {
  const official: OfficialPriceCopy = {
    presentationId: 'arroz-500g',
    establishmentId: donJose.id,
    priceCop: 2000,
    confirmedAt: hoursAgo(72),
    priceChangedAt: hoursAgo(72),
  };

  it('incluye tiendas con solo precio oficial y calcula el ahorro con ese precio', async () => {
    const featured = setup([price('arroz-500g', ara.id, 4000)], [], [official]);
    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.storesWithPrices).toBe(2);
    expect(result.items[0]).toMatchObject({
      storeCount: 2,
      cheapest: { priceCop: 2000, source: 'oficial' },
      priciest: { priceCop: 4000, source: 'comunidad' },
      savingsPercent: 50,
    });
  });

  it('usa la mediana corroborada para ordenar y calcular el ahorro', async () => {
    const featured = setup(
      [price('arroz-500g', ara.id, 4000), price('arroz-500g', donJose.id, 3600)],
      [],
      [official],
      {
        reportsAt: () =>
          Promise.resolve([
            { reportId: 'r1', priceCop: 2900, observedAt: hoursAgo(2), level: 'alta' },
            { reportId: 'r2', priceCop: 3100, observedAt: hoursAgo(1), level: 'alta' },
          ]),
      },
    );
    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.items[0]).toMatchObject({
      cheapest: {
        priceCop: 2900,
        source: 'comunidad',
        discrepancy: { officialPriceCop: 2000, reportedPriceCop: 2900, reports: 2 },
      },
      savingsPercent: 28,
    });
  });

  it('conserva el reporte vigente cuando el oficial expiró', async () => {
    const featured = setup(
      [price('arroz-500g', donJose.id, 2500)],
      [],
      [{ ...official, confirmedAt: hoursAgo(24 * 30) }],
    );
    const result = await featured.of({ municipality: 'armenia', radiusKm: 1.5, limit: 5 });

    expect(result.items[0]?.cheapest).toMatchObject({ priceCop: 2500, source: 'comunidad' });
  });
});
