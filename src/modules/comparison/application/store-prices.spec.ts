import type { PresentationForPricing } from '../../catalog';
import type { PriceRef, PriceReliability } from '../../reliability';
import type { CurrentPrice } from './current-prices';
import { StorePrices } from './store-prices';

const now = new Date('2026-11-15T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const store = {
  id: 'tienda-1',
  name: 'Tienda Don José',
  type: 'barrio' as const,
  address: 'Cra. 14 # 20-10',
  lat: 4.535,
  lng: -75.6811,
};

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

const price = (
  presentationId: string,
  priceCop: number,
  change: Partial<CurrentPrice> = {},
): CurrentPrice => ({
  reportId: `reporte-${presentationId}`,
  presentationId,
  establishmentId: store.id,
  priceCop,
  observedAt: hoursAgo(2),
  status: 'vigente',
  ...change,
});

function setup(prices: CurrentPrice[], presentations: Map<string, PresentationForPricing>) {
  const asked: { refs: PriceRef[]; ttlDays: number }[] = [];
  const storePrices = new StorePrices({
    stores: { find: (id) => Promise.resolve(id === store.id ? store : null) },
    presentations: { of: () => Promise.resolve(presentations) },
    prices: { findByEstablishment: () => Promise.resolve(prices) },
    reliability: {
      of: (refs, ttlDays): Promise<PriceReliability[]> => {
        asked.push({ refs, ttlDays });
        return Promise.resolve(refs.map((ref) => ({ ...ref, level: 'media', confirmations: 1 })));
      },
    },
    clock: { now: () => now },
  });
  return { asked, storePrices };
}

describe('precios vigentes de una tienda (RF-008, grill de la #28)', () => {
  it('cada precio trae su producto, su precio por unidad, su fuente, su vigencia y su confiabilidad, ordenados por producto', async () => {
    const presentations = new Map([
      [
        'leche-1l',
        presentation('leche', 'Leche Colanta · 1 l', { quantity: 1, unit: 'l', isFresh: true }),
      ],
      ['arroz-500g', presentation('arroz', 'Arroz Diana · 500 g')],
    ]);
    const { asked, storePrices } = setup(
      [price('leche-1l', 4800), price('arroz-500g', 2500)],
      presentations,
    );

    const result = await storePrices.of(store.id, { onlyCurrent: false });

    expect(result?.establishment).toEqual(store);
    expect(result?.prices.map((item) => item.productName)).toEqual([
      'Arroz Diana · 500 g',
      'Leche Colanta · 1 l',
    ]);
    expect(result?.prices[0]).toMatchObject({
      productId: 'arroz',
      presentationId: 'arroz-500g',
      reportId: 'reporte-arroz-500g',
      priceCop: 2500,
      source: 'comunidad',
      freshness: 'vigente',
      reliability: 'media',
      confirmations: 1,
      observedAt: hoursAgo(2),
    });
    // 500 g a $2.500 equivale a $500 por 100 g.
    expect(result?.prices[0]?.unitPrice.displayCop).toBe(500);
    expect(result?.prices[0]?.unitPrice.per).toBe('100g');
    // La confiabilidad usa el TTL de la categoría de cada presentación.
    expect(asked.map((call) => call.ttlDays).sort((a, b) => a - b)).toEqual([7, 14]);
  });
});
