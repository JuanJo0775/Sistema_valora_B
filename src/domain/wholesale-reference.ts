import { colombiaDate } from './colombia-date';
import { baseOf, type Unit } from './unit-price';

// Grill de la #34, pregunta 3: días que una referencia SIPSA se sigue mostrando después de su periodo.
export const REFERENCE_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// RF-014 RN2: SIPSA publica pesos por kilo; solo es comparable con un producto de peso.
export const acceptsWholesaleReference = (unit: Unit): boolean => baseOf(unit) === '100g';

// La fecha de fin del periodo (AAAA-MM-DD) frente a hoy en Colombia.
export function isRecentReference(periodEnd: string, now: Date): boolean {
  const today = colombiaDate(now);
  const ageDays =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${periodEnd}T00:00:00Z`)) / DAY_MS;
  return ageDays <= REFERENCE_MAX_AGE_DAYS;
}
