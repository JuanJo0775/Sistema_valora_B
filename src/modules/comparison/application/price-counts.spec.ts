import type { PresentationForPricing } from '../../catalog';
import type { CurrentPrice } from './current-prices';
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
  presentationId,
  establishmentId,
  priceCop: 2000,
  observedAt: daysAgo(1),
  status: 'vigente',
  ...change,
});

function setup(prices: CurrentPrice[], presentations: Map<string, PresentationForPricing>) {
  const asked: string[][] = [];
  const counts = new PriceCounts({
    prices: {
      findByEstablishments: (ids) => {
        asked.push(ids);
        return Promise.resolve(prices.filter((p) => ids.includes(p.establishmentId)));
      },
    },
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
});
