import { type AnomalyInput, assessAnomaly } from './anomaly';
import type { ScoredReport } from './report-window';

const now = new Date('2026-11-14T14:00:00Z');
const aYearAgo = new Date('2025-11-14T14:00:00Z');

// Reporte de prueba: por defecto, precio normal recién visto.
const report = (
  reporterKey: string,
  priceCop: number,
  change: Partial<ScoredReport> = {},
): ScoredReport => ({ reporterKey, priceCop, priceType: 'normal', observedAt: now, ...change });

// Por defecto: TTL de 14 días y cuentas creadas hace un año.
const assess = (
  candidate: ScoredReport,
  others: ScoredReport[],
  change: Partial<AnomalyInput> = {},
) =>
  assessAnomaly({
    candidate,
    others,
    now,
    ttlDays: 14,
    accountCreatedAt: () => aYearAgo,
    ...change,
  });

describe('detección de precios anómalos', () => {
  it('con menos de 3 cuentas de referencia no marca: devuelve sin_datos y cuántas había', () => {
    const result = assess(report('ana', 2500), [report('beto', 5000), report('caro', 5100)]);

    expect(result).toEqual({ status: 'sin_datos', references: 2 });
  });
});
