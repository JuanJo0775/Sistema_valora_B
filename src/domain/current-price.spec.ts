import { replacesCurrentPrice } from './current-price';

const at = (time: string): Date => new Date(`2026-11-12T${time}:00Z`);

describe('qué reporte queda como precio vigente', () => {
  it('un reporte observado después del vigente lo reemplaza', () => {
    const current = { observedAt: at('09:00'), receivedAt: at('09:01') };
    const candidate = { observedAt: at('12:00'), receivedAt: at('12:01') };

    expect(replacesCurrentPrice(candidate, current)).toBe(true);
  });
});
