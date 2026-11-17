import { acceptsWholesaleReference, isRecentReference } from './wholesale-reference';

// Grill de la #34, pregunta 3 (RF-014 RN2): SIPSA publica pesos por kilo.
describe('referencia mayorista SIPSA (#34)', () => {
  it.each(['g', 'kg'] as const)('un producto en %s acepta la referencia por kilo', (unit) => {
    expect(acceptsWholesaleReference(unit)).toBe(true);
  });

  it.each(['ml', 'l', 'und'] as const)(
    'un producto en %s no es comparable con un precio por kilo',
    (unit) => {
      expect(acceptsWholesaleReference(unit)).toBe(false);
    },
  );

  it('una referencia cuyo periodo terminó hace 30 días o menos se muestra; una más vieja, no', () => {
    const now = new Date('2026-11-15T15:00:00Z');

    expect(isRecentReference('2026-11-15', now)).toBe(true);
    expect(isRecentReference('2026-10-16', now)).toBe(true);
    expect(isRecentReference('2026-10-15', now)).toBe(false);
  });
});
