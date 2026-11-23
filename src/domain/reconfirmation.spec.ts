import { reconfirmationDue } from './reconfirmation';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-22T15:00:00Z');
const confirmedDaysAgo = (days: number) => new Date(now.getTime() - days * DAY);

// D4 del grill comercial: recordatorio un día antes de que el oficial deje de estar vigente.
describe('recordatorio para reconfirmar un precio oficial (D4)', () => {
  it('con más de un día de vigencia por delante no hace falta recordar', () => {
    expect(reconfirmationDue({ confirmedAt: confirmedDaysAgo(12), ttlDays: 14, now })).toBeNull();
  });

  it('cuando le queda un día o menos, vence pronto', () => {
    expect(reconfirmationDue({ confirmedAt: confirmedDaysAgo(13), ttlDays: 14, now })).toBe(
      'vence_pronto',
    );
    expect(reconfirmationDue({ confirmedAt: confirmedDaysAgo(6.5), ttlDays: 7, now })).toBe(
      'vence_pronto',
    );
  });

  it('pasada su vigencia, ya venció', () => {
    expect(reconfirmationDue({ confirmedAt: confirmedDaysAgo(15), ttlDays: 14, now })).toBe(
      'vencido',
    );
  });
});
