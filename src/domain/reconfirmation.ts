// D4 del grill comercial: el precio oficial vale lo mismo que un reporte (ADR-005). Un día antes de
// que deje de estar vigente se le recuerda al comercio que lo reconfirme.
export const REMINDER_DAYS_BEFORE = 1;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type ReconfirmationDue = 'vence_pronto' | 'vencido';

export function reconfirmationDue({
  confirmedAt,
  ttlDays,
  now,
}: {
  confirmedAt: Date;
  ttlDays: number;
  now: Date;
}): ReconfirmationDue | null {
  const left = confirmedAt.getTime() + ttlDays * DAY_IN_MILLISECONDS - now.getTime();
  if (left < 0) return 'vencido';
  return left <= REMINDER_DAYS_BEFORE * DAY_IN_MILLISECONDS ? 'vence_pronto' : null;
}
