import { DAY_IN_MILLISECONDS } from './report-window';

// Grill de la #71, pregunta 2: valor PROVISIONAL (ADR-005).
export const APPEAL_PARAMS = { days: 7 };

// RF-013 RN4: hasta cuándo el autor puede apelar un reporte descartado.
export const appealableUntil = (discardedAt: Date): Date =>
  new Date(discardedAt.getTime() + APPEAL_PARAMS.days * DAY_IN_MILLISECONDS);

export const isAppealable = (discardedAt: Date, now: Date): boolean =>
  now.getTime() <= appealableUntil(discardedAt).getTime();
