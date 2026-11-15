import { burstAt, REPORT_LIMITS } from './report-limits';

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

  it('el límite es de 20 reportes por hora (provisional)', () => {
    expect(REPORT_LIMITS.burstPerHour).toBe(20);
  });

  it('el reporte que deja 20 observaciones en una hora completa la ráfaga y dice cuáles son las otras', () => {
    const hour = observed(19, at(10, 10), 2);

    const check = burstAt(hour, at(10, 50));

    expect(check).toMatchObject({ exceeded: false, completes: true });
    expect(check.window).toEqual(hour.map((report) => report.id));
    expect(burstAt(observed(18, at(10, 10), 2), at(10, 50)).completes).toBe(false);
  });
});
