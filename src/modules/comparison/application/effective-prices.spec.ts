import type { CurrentPrice } from './current-prices';
import { effectivePrices } from './effective-prices';
import type { OfficialPriceCopy } from './official-price-copies';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-22T15:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

const community = (establishmentId: string, priceCop: number): CurrentPrice => ({
  reportId: `reporte-${establishmentId}`,
  presentationId: 'arroz',
  establishmentId,
  priceCop,
  observedAt: daysAgo(1),
  status: 'vigente',
  source: 'comunidad',
});
const official = (establishmentId: string, priceCop: number): OfficialPriceCopy => ({
  presentationId: 'arroz',
  establishmentId,
  priceCop,
  confirmedAt: daysAgo(1),
  priceChangedAt: daysAgo(3),
});

// #218: la misma regla del precio oficial (D1) en la comparación, la ficha de la tienda, la canasta
// de hoy y el conteo de precios.
describe('precio efectivo de cada presentación en cada tienda', () => {
  it('donde hay oficial, reemplaza el precio de la comunidad; las demás tiendas siguen igual', async () => {
    const result = await effectivePrices({
      current: [community('a', 2500), community('b', 2400)],
      officials: [official('a', 2200)],
      reliability: { reportsAt: () => Promise.resolve([]) },
      ttlDaysOf: () => 14,
      now,
    });

    expect(result).toEqual([
      community('b', 2400),
      {
        presentationId: 'arroz',
        establishmentId: 'a',
        priceCop: 2200,
        observedAt: daysAgo(1),
        status: 'vigente',
        source: 'oficial',
      },
    ]);
  });

  // D1 y ADR-008: con discrepancia corroborada entra la mediana de la comunidad.
  it('con discrepancia corroborada, el precio efectivo es la mediana, con su reporte y el oficial al lado', async () => {
    const result = await effectivePrices({
      current: [],
      officials: [official('a', 2200)],
      reliability: {
        reportsAt: () =>
          Promise.resolve([
            { reportId: 'r-alto', priceCop: 2700, observedAt: daysAgo(2), level: 'media' as const },
            { reportId: 'r-medio', priceCop: 2600, observedAt: daysAgo(1), level: 'alta' as const },
          ]),
      },
      ttlDaysOf: () => 14,
      now,
    });

    expect(result).toEqual([
      {
        reportId: 'r-medio',
        presentationId: 'arroz',
        establishmentId: 'a',
        priceCop: 2600,
        observedAt: daysAgo(1),
        status: 'vigente',
        source: 'comunidad',
        discrepancy: {
          officialPriceCop: 2200,
          reportedPriceCop: 2600,
          reports: 2,
          since: daysAgo(2),
        },
      },
    ]);
  });
});
