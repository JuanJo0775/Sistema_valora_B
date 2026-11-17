import type { PresentationForPricing, ProductSummaryView } from '../../catalog';
import type { EstablishmentDetail, InMunicipalityQuery } from '../../establishments';
import type { CurrentPrice } from './current-prices';
import { FeaturedProducts } from './featured-products';

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
  presentationId,
  establishmentId,
  priceCop,
  observedAt: hoursAgo(2),
  status: 'vigente',
  ...change,
});

function setup(prices: CurrentPrice[]) {
  const stores = [donJose, ara, exito];
  return new FeaturedProducts({
    prices: { findAll: () => Promise.resolve(prices) },
    stores: {
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

    const result = await featured.of({ municipality: 'armenia', limit: 5 });

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

    const result = await featured.of({ municipality: 'armenia', limit: 5 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: 'arroz',
      storeCount: 1,
      cheapest: { presentationId: 'arroz-500g', priceCop: 2500 },
    });
  });
});
