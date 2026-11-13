import { reliabilityScore, type ReliabilityInput, type ScoredReport } from './reliability';

const now = new Date('2026-11-13T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

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

  it('la misma cuenta del candidato no corrobora (RN4) y cada otra cuenta cuenta una vez, con su reporte más reciente', () => {
    const result = score({
      others: [
        report('ana', 4000, { observedAt: daysAgo(1) }),
        report('beto', 4500, { observedAt: daysAgo(2) }),
        report('beto', 4050, { observedAt: daysAgo(1) }),
      ],
    });

    expect(result.corroborations).toBe(1);
    expect(result.contradictions).toBe(0);
  });

  it('solo se compara el mismo tipo de precio: una oferta no contradice un precio normal', () => {
    const result = score({ others: [report('beto', 3200, { priceType: 'oferta' })] });

    expect(result.contradictions).toBe(0);
    expect(result.score).toBeCloseTo(0.25);
  });

  it('un reporte más viejo que el TTL ni corrobora ni contradice', () => {
    const result = score({
      others: [
        report('beto', 4000, { observedAt: daysAgo(15) }),
        report('caro', 4800, { observedAt: daysAgo(20) }),
      ],
    });

    expect(result.corroborations).toBe(0);
    expect(result.contradictions).toBe(0);
  });

  it('a partir de 3 corroboraciones, una más no sube el score', () => {
    const five = ['beto', 'caro', 'dani', 'eli', 'fer'].map((key) => report(key, 4000));

    const result = score({ others: five });

    expect(result.corroborations).toBe(5);
    expect(result.score).toBeCloseTo(0.75);
  });

  it('cada corroboración pesa según la reputación de su cuenta, y el score queda entre 0 y 1', () => {
    const reputations: Record<string, number> = { ana: 0.5, confiable: 1, dudosa: 0.1 };
    const reputationOf = (key: string) => reputations[key] ?? 0.5;

    // Una cuenta de reputación 1 pesa como dos neutras; una de 0,1, casi nada.
    expect(score({ reputationOf, others: [report('confiable', 4000)] }).score).toBeCloseTo(
      0.25 + (0.5 * 2) / 3,
    );
    expect(score({ reputationOf, others: [report('dudosa', 4000)] }).score).toBeCloseTo(
      0.25 + (0.5 * 0.2) / 3,
    );
    // Reportante muy confiable y tres corroboraciones: el máximo es 1.
    const three = ['beto', 'caro', 'dani'].map((key) => report(key, 4000));
    expect(score({ reputationOf: () => 1, others: three }).score).toBeCloseTo(1);
    // Reportante sin reputación y contradicho: el mínimo es 0.
    expect(score({ reputationOf: () => 0, others: [report('beto', 5000)] }).score).toBe(0);
  });
});
