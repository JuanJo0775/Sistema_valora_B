import { dailyHistory, historyWindow } from './price-history';

// Grill de la #83, preguntas 2 y 3 (RF-008 RN4).
describe('historial diario de precios (#83)', () => {
  // 15 de noviembre a las 10:00 en Colombia.
  const now = new Date('2026-11-15T15:00:00Z');
  const price = (presentationId: string, priceCop: number, observedAt: string) => ({
    presentationId,
    priceCop,
    observedAt: new Date(observedAt),
  });

  it('la ventana son los últimos 30 días en hora de Colombia, hoy incluido', () => {
    expect(historyWindow(now)).toEqual({
      from: '2026-10-17',
      to: '2026-11-15',
      since: new Date('2026-10-17T05:00:00Z'),
    });
  });

  it('agrupa por presentación y por día de Colombia, con el mínimo, el promedio en pesos y la cantidad', () => {
    const history = dailyHistory(
      [
        price('arroz-500', 2400, '2026-11-14T13:00:00Z'),
        price('arroz-500', 2601, '2026-11-14T20:00:00Z'),
        // 22:00 del 14 en Colombia, aunque en UTC ya es el 15.
        price('arroz-500', 2500, '2026-11-15T03:00:00Z'),
        price('arroz-1000', 4500, '2026-11-15T14:00:00Z'),
      ],
      now,
    );

    expect(history.series.get('arroz-500')).toEqual([
      { date: '2026-11-14', minPriceCop: 2400, avgPriceCop: 2500, reports: 3 },
    ]);
    expect(history.series.get('arroz-1000')).toEqual([
      { date: '2026-11-15', minPriceCop: 4500, avgPriceCop: 4500, reports: 1 },
    ]);
  });

  it('los días van del más viejo al más reciente y lo anterior a la ventana no cuenta', () => {
    const history = dailyHistory(
      [
        price('arroz-500', 2500, '2026-11-15T14:00:00Z'),
        // 16 de octubre a las 23:00 en Colombia: un día antes de la ventana.
        price('arroz-500', 1000, '2026-10-17T04:00:00Z'),
        price('arroz-500', 2300, '2026-10-17T05:00:00Z'),
      ],
      now,
    );

    expect(history.series.get('arroz-500')?.map((point) => point.date)).toEqual([
      '2026-10-17',
      '2026-11-15',
    ]);
  });
});
