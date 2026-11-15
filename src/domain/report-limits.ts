// Grill de la #29, preguntas 2 y 3: valores PROVISIONALES (ADR-005).
export const REPORT_LIMITS = {
  // Una cuenta no reporta la misma presentación en la misma tienda dos veces en este tiempo.
  duplicateWindowMinutes: 60,
  // RF-012 RN2: más reportes que estos en una hora es una ráfaga.
  burstPerHour: 20,
};

const HOUR_MS = 60 * 60 * 1000;

// Segundos que la cuenta debe esperar para reportar otra vez, o null si puede reportar. `received`
// son las horas de llegada de sus reportes.
export function burstWaitSeconds(received: Date[], now: Date): number | null {
  const windowStart = now.getTime() - HOUR_MS;
  const inWindow = received
    .map((date) => date.getTime())
    .filter((time) => time > windowStart)
    .sort((a, b) => a - b);
  if (inWindow.length < REPORT_LIMITS.burstPerHour) return null;
  // Puede volver a reportar cuando el más viejo de los últimos N salga de la ventana.
  const blocking = inWindow[inWindow.length - REPORT_LIMITS.burstPerHour] ?? now.getTime();
  return Math.ceil((blocking + HOUR_MS - now.getTime()) / 1000);
}

// El reporte que deja a la cuenta justo en el límite avisa a moderación (una vez por ráfaga).
export const completesBurst = (reportsInHour: number): boolean =>
  reportsInHour === REPORT_LIMITS.burstPerHour;
