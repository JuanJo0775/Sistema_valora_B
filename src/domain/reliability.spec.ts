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

  it('otra cuenta que reporta 4100 frente a 4000 (2,5 %) lo corrobora y sube el score a 0,42', () => {
    const result = score({ others: [report('beto', 4100)] });

    expect(result.score).toBeCloseTo(0.25 + 0.5 / 3);
    expect(result.corroborations).toBe(1);
  });

  it('otra cuenta que reporta 4500 frente a 4000 (12,5 %) lo contradice y baja el score a 0,08', () => {
    const result = score({ others: [report('beto', 4500)] });

    expect(result.score).toBeCloseTo(0.25 - 0.5 / 3);
    expect(result.corroborations).toBe(0);
    expect(result.contradictions).toBe(1);
  });
});
