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

  it('caso del grill: oficial $4.000 y reportes de $4.700, $4.800 y $5.900 → entra $4.800', () => {
    const middle = report(4800, { observedAt: daysAgo(1) });
    const earliest = report(4700, { observedAt: daysAgo(3) });

    expect(resolve([earliest, middle, report(5900)])).toEqual({
      kind: 'discrepancia',
      priceCop: 4800,
      reportId: middle.reportId,
      discrepancy: {
        officialPriceCop: 4000,
        reportedPriceCop: 4800,
        reports: 3,
        since: earliest.observedAt,
      },
    });
  });

  it('con un número par de reportes entra el menor de los dos centrales', () => {
    const lower = report(4600);

    expect(resolve([report(4800), lower])).toMatchObject({
      priceCop: 4600,
      reportId: lower.reportId,
    });
  });

  it('una diferencia de 5 % exacto coincide con el oficial', () => {
    expect(resolve([report(4200), report(3800)])).toEqual({ kind: 'oficial', priceCop: 4000 });
  });

  it('un solo reporte distinto no basta para corroborar', () => {
    expect(resolve([report(4800)])).toEqual({ kind: 'oficial', priceCop: 4000 });
  });
});
