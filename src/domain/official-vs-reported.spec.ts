import { officialVsReported, type ReportedPrice } from './official-vs-reported';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-30T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
// El comercio cambió su precio a $4.000 hace 5 días.
const official = { priceCop: 4000, changedAt: daysAgo(5) };

// Un reporte confiable de hace 2 días, después del cambio del oficial.
let counter = 0;
const report = (priceCop: number, overrides: Partial<ReportedPrice> = {}): ReportedPrice => {
  counter += 1;
  return {
    reportId: `reporte-${String(counter)}`,
    priceCop,
    observedAt: daysAgo(2),
    reliable: true,
    ...overrides,
  };
};

const resolve = (reports: ReportedPrice[]) =>
  officialVsReported({ official, reports, now, ttlDays: 14 });

describe('precio oficial frente a reportado (D1 del grill comercial, ADR-008)', () => {
  it('sin reportes que lo contradigan, entra el oficial', () => {
    expect(resolve([])).toEqual({ kind: 'oficial', priceCop: 4000 });
  });
});
