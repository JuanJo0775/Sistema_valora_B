import { DAY_IN_MILLISECONDS } from './report-window';

// Grill de la #33, pregunta 5: valores PROVISIONALES (ADR-005).
export const SUSPENSION_PARAMS = {
  consecutiveRejections: 3,
  days: 7,
};

// Grill de la #33, pregunta 4: una suspensión dura N días desde la decisión que la causa.
export const suspensionEnd = (decidedAt: Date): Date =>
  new Date(decidedAt.getTime() + SUSPENSION_PARAMS.days * DAY_IN_MILLISECONDS);

export type ModerationOutcome = 'aprobar' | 'descartar' | 'observar_cuentas';

// RN6 de RF-013: las decisiones sobre los reportes de una cuenta, en orden; la última es la nueva.
// Devuelve hasta cuándo queda suspendida, o null si esta decisión no la suspende. Suspende cuando
// la racha de descartes al final llega a un múltiplo de N: así vuelve a empezar sin guardar estado.
export function suspensionAfter(decisions: ModerationOutcome[], decidedAt: Date): Date | null {
  let streak = 0;
  for (const decision of decisions) {
    if (decision === 'descartar') streak += 1;
    if (decision === 'aprobar') streak = 0;
  }
  const completesStreak =
    decisions.at(-1) === 'descartar' && streak % SUSPENSION_PARAMS.consecutiveRejections === 0;
  return completesStreak ? suspensionEnd(decidedAt) : null;
}
