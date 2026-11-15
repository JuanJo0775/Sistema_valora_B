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

export interface ObservedReport {
  id: string;
  observedAt: Date;
}

export interface BurstCheck {
  // Con este reporte, alguna hora de observación tendría más reportes que el límite.
  exceeded: boolean;
  // Segundos hasta que un reporte observado después pueda entrar (útil para el reporte en vivo).
  waitSeconds: number | null;
  // Los demás reportes de la hora más cargada que incluye a este.
  window: string[];
}

// Grill de la #30, pregunta 2: la ráfaga se mide por la hora de observación. Se busca la hora (de
// 60 minutos) que contiene la observación nueva y tiene más reportes; así el orden de llegada no
// importa.
export function burstAt(others: ObservedReport[], observedAt: Date): BurstCheck {
  const target = observedAt.getTime();
  const starts = [
    target,
    ...others
      .map((report) => report.observedAt.getTime())
      .filter((time) => time > target - HOUR_MS && time <= target),
  ];
  let window: ObservedReport[] = [];
  for (const start of starts) {
    const inside = others.filter((report) => {
      const time = report.observedAt.getTime();
      return time >= start && time < start + HOUR_MS;
    });
    if (inside.length > window.length) window = inside;
  }
  const exceeded = window.length >= REPORT_LIMITS.burstPerHour;
  return {
    exceeded,
    waitSeconds: exceeded ? waitFor(others, target) : null,
    window: window.map((report) => report.id),
  };
}

// Para observar de nuevo hay que esperar a que el N-ésimo reporte más reciente salga de la hora.
function waitFor(others: ObservedReport[], target: number): number {
  const recent = others
    .map((report) => report.observedAt.getTime())
    .filter((time) => time <= target)
    .sort((a, b) => b - a);
  const blocking = recent[REPORT_LIMITS.burstPerHour - 1] ?? target;
  return Math.max(1, Math.ceil((blocking + HOUR_MS - target) / 1000));
}
