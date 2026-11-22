import { ReliabilityOfPrices } from './reliability-of-prices';
import type { Observation, ObservationStore, ReputationStore } from './stores';

const now = new Date('2026-11-14T14:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

const observation = (
  reportId: string,
  reporterKey: string,
  priceCop: number,
  change: Partial<Observation> = {},
): Observation => ({
  reportId,
  presentationId: 'arroz-500g',
  establishmentId: 'tienda-centro',
  reporterKey,
  reporterSince: new Date('2025-01-01'),
  priceCop,
  priceType: 'normal',
  observedAt: hoursAgo(1),
  receivedAt: hoursAgo(1),
  verdict: { status: 'normal', median: priceCop, deviation: 0, references: 3 },
  ...change,
});

function setup(saved: Observation[], reputations: Record<string, number> = {}) {
  const observations: ObservationStore = {
    forPresentation: (presentationId, ids) =>
      Promise.resolve(
        saved.filter((o) => o.presentationId === presentationId && ids.includes(o.establishmentId)),
      ),
    byReportId: () => Promise.reject(new Error('ReliabilityOfPrices no busca por reporte')),
    save: () => Promise.reject(new Error('ReliabilityOfPrices no guarda')),
  };
  const reputationStore: ReputationStore = {
    valuesOf: (keys) =>
      Promise.resolve(
        new Map(
          keys.flatMap((key) =>
            key in reputations ? [[key, reputations[key] ?? 0] as const] : [],
          ),
        ),
      ),
    claimPoint: () => Promise.reject(new Error('ReliabilityOfPrices no da puntos')),
    save: () => Promise.reject(new Error('ReliabilityOfPrices no guarda')),
  };
  return new ReliabilityOfPrices({
    observations,
    reputations: reputationStore,
    clock: { now: () => now },
  });
}

const price = { presentationId: 'arroz-500g', establishmentId: 'tienda-centro', reportId: 'r-ana' };

describe('confiabilidad de los precios que muestra la comparación', () => {
  it('calcula el nivel y las confirmaciones con la reputación guardada y la hora actual', async () => {
    const reliability = setup(
      [observation('r-ana', 'ana', 4000), observation('r-beto', 'beto', 4050)],
      { ana: 1, beto: 1 },
    );

    const [result] = await reliability.of([price], 14);

    // Ana y Beto con reputación 1: 0,5 + 0,5 × 2/3 ≈ 0,82 por 0,997 de edad → alta.
    expect(result).toEqual({ ...price, level: 'alta', confirmations: 1 });
  });

  it('con un solo reporte de una cuenta neutra el nivel es media y sin confirmaciones', async () => {
    const [result] = await setup([observation('r-ana', 'ana', 4000)]).of([price], 14);

    expect(result).toEqual({ ...price, level: 'media', confirmations: 0 });
  });

  // Grill de la #32, pregunta 4: la moderación cambia lo que confirma un precio.
  it('un reporte descartado no confirma; uno sospechoso aprobado confirma como cualquier otro', async () => {
    const suspicious = {
      verdict: {
        status: 'sospechoso',
        reason: 'rango',
        median: 4000,
        deviation: 0.5,
        references: 3,
      },
    } as const;
    const withDiscarded = setup([
      observation('r-ana', 'ana', 4000),
      observation('r-beto', 'beto', 4050, { moderation: 'descartado' }),
    ]);
    const withApproved = setup([
      observation('r-ana', 'ana', 4000),
      observation('r-caro', 'caro', 3950, { ...suspicious, moderation: 'aprobado' }),
    ]);

    const [discarded] = await withDiscarded.of([price], 14);
    const [approved] = await withApproved.of([price], 14);

    expect(discarded?.confirmations).toBe(0);
    expect(approved?.confirmations).toBe(1);
  });
});

// D1 del grill comercial (#204): los reportes que comparison compara con el precio oficial.
describe('reportes recientes de una tienda para el precio oficial', () => {
  it('uno por persona (el más reciente), con su nivel y sin la clave de quien reportó', async () => {
    const reliability = setup(
      [
        observation('r-ana-viejo', 'ana', 4600, { observedAt: hoursAgo(30) }),
        observation('r-ana', 'ana', 4800),
        observation('r-beto', 'beto', 4800),
      ],
      { ana: 1, beto: 1 },
    );

    const reports = await reliability.reportsAt('arroz-500g', 'tienda-centro', 14);

    expect(reports).toEqual([
      { reportId: 'r-ana', priceCop: 4800, observedAt: hoursAgo(1), level: 'alta' },
      { reportId: 'r-beto', priceCop: 4800, observedAt: hoursAgo(1), level: 'alta' },
    ]);
  });
});
