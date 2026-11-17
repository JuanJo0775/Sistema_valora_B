// PR-22 (ISO/IEC 25012, exactitud): el precio que Valora publica frente al que el equipo vio en la
// tienda. MC-E2: se registran las diferencias, sin porcentaje mínimo.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeenPrice {
  priceCop: number;
  observedAt: Date;
}

export type Accuracy =
  | { status: 'sin_precio' }
  | {
      status: 'coincide' | 'difiere';
      // Publicado menos observado: positivo si Valora muestra más caro.
      diffCop: number;
      // Sobre el precio observado en la tienda, con un decimal.
      diffPct: number;
      daysApart: number;
    };

export interface AccuracySummary {
  rows: number;
  compared: number;
  matching: number;
  withoutPrice: number;
  medianAbsDiffPct: number | null;
}

export function accuracyOf(observed: SeenPrice, published: SeenPrice | null): Accuracy {
  if (!published) return { status: 'sin_precio' };
  const diffCop = published.priceCop - observed.priceCop;
  return {
    status: diffCop === 0 ? 'coincide' : 'difiere',
    diffCop,
    diffPct: Math.round((diffCop / observed.priceCop) * 1000) / 10,
    daysApart: Math.round(
      Math.abs(published.observedAt.getTime() - observed.observedAt.getTime()) / DAY_MS,
    ),
  };
}

export function accuracySummary(results: Accuracy[]): AccuracySummary {
  const compared = results.flatMap((result) => (result.status === 'sin_precio' ? [] : [result]));
  return {
    rows: results.length,
    compared: compared.length,
    matching: compared.filter((result) => result.status === 'coincide').length,
    withoutPrice: results.length - compared.length,
    medianAbsDiffPct: median(compared.map((result) => Math.abs(result.diffPct))),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
