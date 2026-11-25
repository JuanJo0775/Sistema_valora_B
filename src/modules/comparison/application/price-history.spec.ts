import type { HistoryPrice } from '../../../domain/price-history';
import type { ProductForComparisonView } from '../../catalog';
import { PriceHistory } from './price-history';

// 15 de noviembre a las 10:00 en Colombia.
const now = new Date('2026-11-15T15:00:00Z');
const rice: ProductForComparisonView = {
  id: 'arroz',
  isFresh: false,
  presentations: [
    { id: 'arroz-500', quantity: 500, unit: 'g', packCount: 1 },
    { id: 'arroz-1000', quantity: 1, unit: 'kg', packCount: 1 },
  ],
};

function setup(prices: HistoryPrice[], retiredStores: string[] = []) {
  const excluded: string[][] = [];
  const asked: { presentationIds: string[]; since: Date; establishmentId?: string }[] = [];
  const history = new PriceHistory({
    products: { find: (id) => Promise.resolve(id === rice.id ? rice : null) },
    labels: {
      of: () =>
        Promise.resolve(
          new Map([
            ['arroz-500', 'Arroz blanco 500 g'],
            ['arroz-1000', 'Arroz blanco 1 kg'],
          ]),
        ),
    },
    history: {
      countedSince: (presentationIds, since, establishmentId, excludedIds = []) => {
        excluded.push(excludedIds);
        asked.push({ presentationIds, since, ...(establishmentId ? { establishmentId } : {}) });
        return Promise.resolve(prices);
      },
    },
    retired: { ids: () => Promise.resolve(retiredStores) },
    clock: { now: () => now },
  });
  return { asked, excluded, history };
}

describe('historial de precios de un producto (RF-008 RN4, grill de la #83)', () => {
  it('H36: los precios de las tiendas retiradas se conservan pero no entran al historial', async () => {
    const { excluded, history } = setup([], ['tienda-retirada']);

    await history.of('arroz', {});

    expect(excluded).toEqual([['tienda-retirada']]);
  });

  it('una serie por presentación, con su nombre y la fuente de cada punto', async () => {
    const { asked, history } = setup([
      { presentationId: 'arroz-500', priceCop: 2400, observedAt: new Date('2026-11-14T15:00:00Z') },
    ]);

    const result = await history.of('arroz', { establishmentId: 'tienda-1' });

    expect(asked).toEqual([
      {
        presentationIds: ['arroz-500', 'arroz-1000'],
        since: new Date('2026-10-17T05:00:00Z'),
        establishmentId: 'tienda-1',
      },
    ]);
    expect(result).toEqual({
      from: '2026-10-17',
      to: '2026-11-15',
      presentations: [
        {
          presentationId: 'arroz-500',
          label: 'Arroz blanco 500 g',
          points: [
            {
              date: '2026-11-14',
              minPriceCop: 2400,
              avgPriceCop: 2400,
              reports: 1,
              source: 'reportado',
            },
          ],
        },
        { presentationId: 'arroz-1000', label: 'Arroz blanco 1 kg', points: [] },
      ],
    });
  });

  it('un producto que no existe no tiene historial', async () => {
    const { history } = setup([]);

    await expect(history.of('no-existe', {})).resolves.toBeNull();
  });
});
