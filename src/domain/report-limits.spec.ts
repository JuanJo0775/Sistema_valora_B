import { burstAt, burstWaitSeconds, completesBurst, REPORT_LIMITS } from './report-limits';

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

// Grill de la #30, pregunta 2: la ráfaga cuenta por la hora de observación, no por la de llegada.
describe('ráfaga por hora de observación (grill de la #30)', () => {
  const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 15, hour, minute));
  // n reportes observados cada `step` minutos desde `start`.
  const observed = (n: number, start: Date, step: number) =>
    Array.from({ length: n }, (_, index) => ({
      id: `reporte-${String(index)}`,
      observedAt: new Date(start.getTime() + index * step * 60 * 1000),
    }));

  it('50 reportes de la cola observados a lo largo del día no son ráfaga, aunque lleguen juntos', () => {
    const day = observed(49, at(6), 20);

    expect(burstAt(day, at(23)).exceeded).toBe(false);
  });

  it('20 observados en una hora más uno nuevo de esa misma hora son ráfaga, aunque el nuevo sea el más viejo', () => {
    const hour = observed(20, at(10, 10), 2);

    expect(burstAt(hour, at(10, 5)).exceeded).toBe(true);
    expect(burstAt(hour, at(10, 50)).exceeded).toBe(true);
  });

  it('una observación fuera de esa hora no es ráfaga', () => {
    const hour = observed(20, at(10, 10), 2);

    expect(burstAt(hour, at(9, 5)).exceeded).toBe(false);
    expect(burstAt(hour, at(11, 30)).exceeded).toBe(false);
  });

  it('para un reporte en vivo dice cuántos segundos esperar para observar de nuevo', () => {
    // 20 observados entre las 13:10 y las 13:48; el nuevo, a las 14:00.
    const hour = observed(20, at(13, 10), 2);

    expect(burstAt(hour, at(14)).waitSeconds).toBe(10 * 60);
  });
});
