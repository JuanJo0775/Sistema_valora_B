// Grill de la #83 (RF-008 RN4): el historial de precios, día por día, de los últimos 30 días.
export const HISTORY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
// Colombia está en UTC-5 todo el año (no cambia de hora).
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;

export interface HistoryPrice {
  presentationId: string;
  priceCop: number;
  observedAt: Date;
}

export interface DailyPoint {
  date: string;
  minPriceCop: number;
  avgPriceCop: number;
  reports: number;
}

export interface HistoryWindow {
  from: string;
  to: string;
  // El primer instante del día `from` en Colombia: desde ahí se piden los precios.
  since: Date;
}

const colombiaDate = (instant: Date): string =>
  new Date(instant.getTime() + COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);

export function historyWindow(now: Date): HistoryWindow {
  const to = colombiaDate(now);
  const startOfToday = Date.parse(`${to}T00:00:00Z`) - COLOMBIA_OFFSET_MS;
  const since = new Date(startOfToday - (HISTORY_DAYS - 1) * DAY_MS);
  return { from: colombiaDate(since), to, since };
}

// Grill de la #83, preguntas 2 y 3: una serie por presentación; los días sin precios no salen.
export function dailyHistory(
  prices: HistoryPrice[],
  now: Date,
): HistoryWindow & { series: Map<string, DailyPoint[]> } {
  const window = historyWindow(now);
  const byDay = new Map<string, Map<string, number[]>>();
  for (const { presentationId, priceCop, observedAt } of prices) {
    const date = colombiaDate(observedAt);
    if (date < window.from || date > window.to) continue;
    const days = byDay.get(presentationId) ?? new Map<string, number[]>();
    days.set(date, [...(days.get(date) ?? []), priceCop]);
    byDay.set(presentationId, days);
  }
  const series = new Map<string, DailyPoint[]>();
  for (const [presentationId, days] of byDay) {
    const points = [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        minPriceCop: Math.min(...values),
        avgPriceCop: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
        reports: values.length,
      }));
    series.set(presentationId, points);
  }
  return { ...window, series };
}
