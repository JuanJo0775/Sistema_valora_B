import type { PresentationForPricing } from '../../catalog';
import type { CurrentPrice } from './current-prices';
import type { OfficialPriceCopy } from './official-price-copies';
import { PriceCounts } from './price-counts';

const now = new Date('2026-11-16T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const presentation = (isFresh = false): PresentationForPricing => ({
  productId: 'producto',
  label: 'Producto · 500 g',
  quantity: 500,
  unit: 'g',
  packCount: 1,
  isFresh,
});

const price = (
  establishmentId: string,
  presentationId: string,
  change: Partial<CurrentPrice> = {},
): CurrentPrice => ({
  reportId: `${establishmentId}-${presentationId}`,
  source: 'comunidad',
  presentationId,
  establishmentId,
  priceCop: 2000,
  observedAt: daysAgo(1),
  status: 'vigente',
  ...change,
});

function setup(
  prices: CurrentPrice[],
  presentations: Map<string, PresentationForPricing>,
  officials: OfficialPriceCopy[] = [],
) {
  const asked: string[][] = [];
  const counts = new PriceCounts({
    prices: {
      findByEstablishments: (ids) => {
        asked.push(ids);
        return Promise.resolve(prices.filter((p) => ids.includes(p.establishmentId)));
      },
    },
    // #218: la copia del precio oficial y los reportes de cada tienda.
    officials: {
      findByEstablishments: (ids) =>
        Promise.resolve(officials.filter((o) => ids.includes(o.establishmentId))),
    },
    reliability: { reportsAt: () => Promise.resolve([]) },
    presentations: { of: () => Promise.resolve(presentations) },
    clock: { now: () => now },
  });
  return { asked, counts };
}

describe('cuántos precios vigentes tiene cada tienda (B#131)', () => {
  it('cuenta las presentaciones con precio vigente de cada tienda pedida', async () => {
    const { counts } = setup(
      [price('ara', 'arroz'), price('ara', 'leche'), price('d1', 'arroz')],
      new Map([
        ['arroz', presentation()],
        ['leche', presentation()],
      ]),
    );

    const found = await counts.of(['ara', 'd1']);

    expect(found.get('ara')).toBe(2);
    expect(found.get('d1')).toBe(1);
  });

  it('una tienda sin precios cuenta 0', async () => {
    const { counts } = setup([], new Map());

    const found = await counts.of(['ara']);

    expect(found.get('ara')).toBe(0);
  });

  it('como los precios de una tienda con onlyCurrent: no cuentan los desactualizados ni los que están en revisión', async () => {
    const { counts } = setup(
      [
        price('ara', 'arroz'),
        // Un producto fresco (7 días) visto hace 15 días pasó dos veces su vigencia.
        price('ara', 'banano', { observedAt: daysAgo(15) }),
        price('ara', 'leche', { status: 'en_revision' }),
      ],
      new Map([
        ['arroz', presentation()],
        ['banano', presentation(true)],
        ['leche', presentation()],
      ]),
    );

    const found = await counts.of(['ara']);

    expect(found.get('ara')).toBe(1);
  });

  it('un precio por confirmar sí cuenta, como en los precios de la tienda', async () => {
    // Un producto no fresco (14 días) visto hace 20 días está por confirmar, no desactualizado.
    const { counts } = setup(
      [price('ara', 'arroz', { observedAt: daysAgo(20) })],
      new Map([['arroz', presentation()]]),
    );

    expect((await counts.of(['ara'])).get('ara')).toBe(1);
  });

  it('no cuenta precios de presentaciones que ya no están en el catálogo', async () => {
    const { counts } = setup([price('ara', 'retirada')], new Map());

    expect((await counts.of(['ara'])).get('ara')).toBe(0);
  });

  it('sin tiendas no consulta los precios', async () => {
    const { asked, counts } = setup([], new Map());

    expect((await counts.of([])).size).toBe(0);
    expect(asked).toEqual([]);
  });

  // #218: el mapa cuenta el precio oficial como cualquier precio de la tienda.
  it('cuenta el oficial vigente de una tienda sin precio de la comunidad; el desactualizado no', async () => {
    const official = (presentationId: string, confirmedDaysAgo: number): OfficialPriceCopy => ({
      presentationId,
      establishmentId: 'tienda-rosa',
      priceCop: 2600,
      confirmedAt: daysAgo(confirmedDaysAgo),
      priceChangedAt: daysAgo(confirmedDaysAgo),
    });
    const { counts } = setup(
      [],
      new Map([
        ['arroz', presentation()],
        ['leche', presentation()],
      ]),
      // El arroz se confirmó hace 2 días; la leche hace 40 (desactualizada con 14 de TTL).
      [official('arroz', 2), official('leche', 40)],
    );

    await expect(counts.of(['tienda-rosa'])).resolves.toEqual(new Map([['tienda-rosa', 1]]));
  });
});
