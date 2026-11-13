import { reliabilityScore, type ReliabilityInput, type ScoredReport } from './reliability';

const now = new Date('2026-11-13T14:00:00Z');

// Reporte de prueba: por defecto, precio normal recién visto.
const report = (
  reporterKey: string,
  priceCop: number,
  change: Partial<ScoredReport> = {},
): ScoredReport => ({ reporterKey, priceCop, priceType: 'normal', observedAt: now, ...change });

// Por defecto todas las cuentas son neutras (0,5) y el TTL es de 14 días (no fresco).
const score = (change: Partial<ReliabilityInput>) =>
  reliabilityScore({
    candidate: report('ana', 4000),
    others: [],
    reputationOf: () => 0.5,
    now,
    ttlDays: 14,
    ...change,
  });

describe('score de confiabilidad de un precio', () => {
  it('un reporte solo, de una cuenta neutra y recién visto, tiene score 0,25', () => {
    const result = score({});

    expect(result.score).toBeCloseTo(0.25);
    expect(result.corroborations).toBe(0);
    expect(result.contradictions).toBe(0);
  });
});
