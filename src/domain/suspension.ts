import { DAY_IN_MILLISECONDS } from './report-window';

// Grill de la #33, pregunta 5: valores PROVISIONALES (ADR-005).
export const SUSPENSION_PARAMS = {
  consecutiveRejections: 3,
  days: 7,
};

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
  const { consecutiveRejections, days } = SUSPENSION_PARAMS;
  const completesStreak =
    decisions.at(-1) === 'descartar' && streak > 0 && streak % consecutiveRejections === 0;
  if (!completesStreak) return null;
  return new Date(decidedAt.getTime() + days * DAY_IN_MILLISECONDS);
}
