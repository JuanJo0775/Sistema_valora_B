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

  it('los reportes de confiabilidad baja no corroboran', () => {
    expect(resolve([report(4800, { reliable: false }), report(4800, { reliable: false })])).toEqual(
      {
        kind: 'oficial',
        priceCop: 4000,
      },
    );
  });

  it('los reportes de antes de que el comercio cambiara su precio no lo castigan', () => {
    const before = { observedAt: daysAgo(6) };

    expect(resolve([report(4800, before), report(4800, before)])).toEqual({
      kind: 'oficial',
      priceCop: 4000,
    });
  });

  it('los reportes que ya salieron de la vigencia de la categoría no cuentan', () => {
    // El oficial no cambia hace un mes; los reportes son de hace 20 días y el TTL es de 14.
    const old = { observedAt: daysAgo(20) };

    expect(
      officialVsReported({
        official: { priceCop: 4000, changedAt: daysAgo(30) },
        reports: [report(4800, old), report(4800, old)],
        now,
        ttlDays: 14,
      }),
    ).toEqual({ kind: 'oficial', priceCop: 4000 });
  });

  // Precisión de D1 (22-nov-2026): los reportes deben estar del mismo lado del oficial.
  it('un reporte más caro y otro más barato no corroboran lo mismo', () => {
    expect(resolve([report(4800), report(3200)])).toEqual({ kind: 'oficial', priceCop: 4000 });
  });

  it('dos reportes más baratos también corroboran: entra el menor de los dos', () => {
    const lower = report(3500);

    expect(resolve([report(3600), lower, report(4800)])).toMatchObject({
      kind: 'discrepancia',
      priceCop: 3500,
      reportId: lower.reportId,
    });
  });

  it('si la mayoría de los reportes recientes coincide con el oficial, gana el oficial', () => {
    const agree = [report(4000), report(4050), report(3990)];

    expect(resolve([report(4800), report(4800), ...agree])).toEqual({
      kind: 'oficial',
      priceCop: 4000,
    });
  });

  it('con tantos que coinciden como que difieren, tampoco hay discrepancia', () => {
    expect(resolve([report(4800), report(4800), report(4000), report(4000)])).toEqual({
      kind: 'oficial',
      priceCop: 4000,
    });
  });

  it('con dos más caros y dos más baratos no hay un lado que corrobore', () => {
    expect(resolve([report(4800), report(4900), report(3200), report(3300)])).toEqual({
      kind: 'oficial',
      priceCop: 4000,
    });
  });
});
