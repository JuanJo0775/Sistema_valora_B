import { promotionStatus } from './promotion';

// 22 de noviembre de 2026, 10:00 a. m. en Colombia (UTC-5).
const now = new Date('2026-11-22T15:00:00Z');
const week = { validFrom: '2026-11-20', validUntil: '2026-11-27' };

describe('estado de una promoción (D6 del grill comercial, ADR-009)', () => {
  it('dentro de sus fechas y con el oficial vigente, está activa', () => {
    expect(promotionStatus({ ...week, now, officialFreshness: 'vigente' })).toBe('activa');
  });

  // D6: el «antes» debe ser un precio real y reciente; reconfirmar el oficial la reactiva.
  it.each(['por_confirmar', 'desactualizado'] as const)(
    'con el oficial %s, la promoción se pausa sola',
    (officialFreshness) => {
      expect(promotionStatus({ ...week, now, officialFreshness })).toBe('pausada');
    },
  );
});
