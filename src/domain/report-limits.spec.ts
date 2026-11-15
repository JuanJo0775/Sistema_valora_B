import { burstWaitSeconds, completesBurst, REPORT_LIMITS } from './report-limits';

const now = new Date('2026-11-15T14:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);
// Un reporte cada 2 minutos, el más viejo hace `oldest` minutos.
const reportsSince = (count: number, oldest: number) =>
  Array.from({ length: count }, (_, index) => minutesAgo(oldest - index * 2));

describe('ráfaga de reportes de una cuenta (RF-012 RN2, grill de la #29)', () => {
  it('con 20 reportes en la última hora, el siguiente espera a que el más viejo salga de la ventana', () => {
    expect(burstWaitSeconds(reportsSince(20, 50), now)).toBe(10 * 60);
  });

  it('con 19 reportes en la última hora no espera', () => {
    expect(burstWaitSeconds(reportsSince(19, 50), now)).toBeNull();
  });

  it('los reportes de hace más de una hora no cuentan', () => {
    const old = [minutesAgo(61), minutesAgo(90)];

    expect(burstWaitSeconds([...old, ...reportsSince(19, 50)], now)).toBeNull();
  });

  it('el reporte número 20 completa la ráfaga; el 19 y el 21 no', () => {
    expect(REPORT_LIMITS.burstPerHour).toBe(20);
    expect([19, 20, 21].map(completesBurst)).toEqual([false, true, false]);
  });
});
