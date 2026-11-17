import { accuracyOf, accuracySummary } from './price-accuracy';

// PR-22 (ISO/IEC 25012, exactitud): el precio publicado frente al que el equipo vio en la tienda.
describe('exactitud del precio publicado (#93)', () => {
  const seen = (priceCop: number, day: string) => ({
    priceCop,
    observedAt: new Date(`${day}T15:00:00Z`),
  });

  it('el mismo precio coincide', () => {
    expect(accuracyOf(seen(2500, '2026-11-15'), seen(2500, '2026-11-14'))).toEqual({
      status: 'coincide',
      diffCop: 0,
      diffPct: 0,
      daysApart: 1,
    });
  });

  it('Valora en $2.600 frente a $2.500 en la tienda: $100 y 4 % por encima', () => {
    expect(accuracyOf(seen(2500, '2026-11-10'), seen(2600, '2026-11-15'))).toEqual({
      status: 'difiere',
      diffCop: 100,
      diffPct: 4,
      daysApart: 5,
    });
  });

  it('sin precio en Valora no se compara', () => {
    expect(accuracyOf(seen(2500, '2026-11-15'), null)).toEqual({ status: 'sin_precio' });
  });

  it('el resumen cuenta coincidencias y filas sin precio, y da la mediana de la diferencia absoluta', () => {
    const results = [
      accuracyOf(seen(1000, '2026-11-15'), seen(1000, '2026-11-15')),
      accuracyOf(seen(1000, '2026-11-15'), seen(900, '2026-11-15')),
      accuracyOf(seen(1000, '2026-11-15'), seen(1300, '2026-11-15')),
      accuracyOf(seen(1000, '2026-11-15'), null),
    ];

    expect(accuracySummary(results)).toEqual({
      rows: 4,
      compared: 3,
      matching: 1,
      withoutPrice: 1,
      medianAbsDiffPct: 10,
    });
    expect(accuracySummary([])).toEqual({
      rows: 0,
      compared: 0,
      matching: 0,
      withoutPrice: 0,
      medianAbsDiffPct: null,
    });
  });
});
