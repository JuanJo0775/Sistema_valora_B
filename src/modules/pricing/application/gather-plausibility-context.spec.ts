import type { Unit } from '../../../domain/unit-price';
import { GatherPlausibilityContext } from './gather-plausibility-context';

const presentationId = 'arroz-1kg';
const own = 'tienda-propia';
const now = new Date('2026-11-17T12:00:00Z');

interface Options {
  prices?: { establishmentId: string; priceCop: number }[];
  inMunicipality?: string[];
  presentation?: { productId: string; quantity: number; unit: Unit; packCount: number };
  reference?: { pricePerKgCop: number; periodEnd: string } | null;
}

function setup(options: Options = {}) {
  const calls = { peers: 0, municipality: 0 };
  const context = new GatherPlausibilityContext({
    stores: { find: () => Promise.resolve({ municipality: 'armenia' as const }) },
    inMunicipality: {
      findInMunicipality: ({ ids }) => {
        calls.municipality += 1;
        const allowed = options.inMunicipality ?? ids;
        return Promise.resolve(ids.filter((id) => allowed.includes(id)).map((id) => ({ id })));
      },
    },
    peers: {
      vigentesOf: () => {
        calls.peers += 1;
        return Promise.resolve(options.prices ?? []);
      },
    },
    presentations: {
      of: () =>
        Promise.resolve(
          new Map([
            [
              presentationId,
              options.presentation ?? {
                productId: 'arroz',
                quantity: 1,
                unit: 'kg' as const,
                packCount: 1,
              },
            ],
          ]),
        ),
    },
    references: {
      latestFor: () =>
        Promise.resolve(
          options.reference === undefined
            ? { pricePerKgCop: 2000, periodEnd: '2026-11-10' }
            : options.reference,
        ),
    },
    clock: { now: () => now },
  });
  return { context, calls };
}

const input = { presentationId, establishmentId: own, priceType: 'normal' as const };

describe('contexto de plausibilidad de un reporte', () => {
  it('toma el precio de otras tiendas del municipio, sin la propia', async () => {
    const { context } = setup({
      prices: [
        { establishmentId: own, priceCop: 100 },
        { establishmentId: 'a', priceCop: 1900 },
        { establishmentId: 'b', priceCop: 1990 },
        { establishmentId: 'c', priceCop: 2100 },
      ],
    });

    const result = await context.of(input);

    expect(result.peerPricesCop).toEqual([1900, 1990, 2100]);
  });

  it('descarta las tiendas de otro municipio', async () => {
    const { context } = setup({
      prices: [
        { establishmentId: 'a', priceCop: 1900 },
        { establishmentId: 'lejos', priceCop: 9000 },
      ],
      inMunicipality: ['a'],
    });

    expect((await context.of(input)).peerPricesCop).toEqual([1900]);
  });

  it('sin otras tiendas no consulta el municipio (una consulta menos)', async () => {
    const { context, calls } = setup({ prices: [{ establishmentId: own, priceCop: 100 }] });

    await context.of(input);

    expect(calls.municipality).toBe(0);
    expect(calls.peers).toBe(1);
  });

  it('el mayorista de 1 kg es el precio por kilo de SIPSA', async () => {
    const { context } = setup();

    expect((await context.of(input)).wholesaleTotalCop).toBe(2000);
  });

  it('un empaque de 2 kg vale el doble', async () => {
    const { context } = setup({
      presentation: { productId: 'arroz', quantity: 1, unit: 'kg', packCount: 2 },
    });

    expect((await context.of(input)).wholesaleTotalCop).toBe(4000);
  });

  it('una referencia de más de 30 días no cuenta', async () => {
    const { context } = setup({ reference: { pricePerKgCop: 2000, periodEnd: '2026-09-01' } });

    expect((await context.of(input)).wholesaleTotalCop).toBeNull();
  });

  it('un producto sin referencia o que no es de peso no tiene mayorista', async () => {
    expect((await setup({ reference: null }).context.of(input)).wholesaleTotalCop).toBeNull();
    const liters = setup({
      presentation: { productId: 'leche', quantity: 1, unit: 'l', packCount: 1 },
    });
    expect((await liters.context.of(input)).wholesaleTotalCop).toBeNull();
  });
});
