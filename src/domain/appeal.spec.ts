import { appealableUntil, isAppealable } from './appeal';

const discardedAt = new Date('2026-11-14T14:00:00Z');

describe('plazo para apelar un reporte descartado (RF-013 RN4, grill de la #71)', () => {
  it('se puede apelar hasta 7 días después del descarte', () => {
    expect(appealableUntil(discardedAt)).toEqual(new Date('2026-11-21T14:00:00Z'));
  });

  it('justo al vencer el plazo todavía se puede apelar; un instante después, no', () => {
    expect(isAppealable(discardedAt, new Date('2026-11-21T14:00:00Z'))).toBe(true);
    expect(isAppealable(discardedAt, new Date('2026-11-21T14:00:00.001Z'))).toBe(false);
  });
});
