import { type AnomalyInput, assessAnomaly } from './anomaly';
import type { ScoredReport } from './report-window';

const now = new Date('2026-11-14T14:00:00Z');
const aYearAgo = new Date('2025-11-14T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

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

  // Tres cuentas de referencia alrededor de 5000.
  const usual = () => [report('beto', 4900), report('caro', 5000), report('dani', 5100)];

  it('un precio dentro del 40 % de la mediana es normal, con la mediana, la desviación y las referencias', () => {
    const result = assess(report('ana', 4500), usual());

    expect(result).toEqual({ status: 'normal', median: 5000, deviation: 0.1, references: 3 });
  });

  it.each([
    ['hacia abajo', 2500, 0.5],
    ['hacia arriba', 7500, 0.5],
  ])(
    'un precio que se aparta más del 40 %% %s es sospechoso por rango',
    (_case, priceCop, deviation) => {
      expect(assess(report('ana', priceCop), usual())).toEqual({
        status: 'sospechoso',
        reason: 'rango',
        median: 5000,
        deviation,
        references: 3,
      });
    },
  );

  it('un precio que se aparta justo el 40 % no se marca (RF-012 dice «más de»)', () => {
    expect(assess(report('ana', 3000), usual())).toMatchObject({
      status: 'normal',
      deviation: 0.4,
    });
  });

  it('con un número par de referencias, la mediana es el promedio de los dos del medio', () => {
    const four = [
      report('beto', 4000),
      report('caro', 4100),
      report('dani', 4200),
      report('eli', 9000),
    ];

    expect(assess(report('ana', 4150), four)).toMatchObject({ median: 4150, deviation: 0 });
  });

  it('solo cuentan como referencia los reportes de la ventana, del mismo tipo, de otras cuentas y uno por cuenta', () => {
    const result = assess(report('ana', 2500), [
      ...usual(),
      report('ana', 2500, { observedAt: daysAgo(1) }),
      report('eli', 2400, { priceType: 'oferta' }),
      report('fer', 2500, { observedAt: daysAgo(20) }),
      report('beto', 9000, { observedAt: daysAgo(3) }),
    ]);

    expect(result).toMatchObject({ status: 'sospechoso', median: 5000, references: 3 });
  });
});
