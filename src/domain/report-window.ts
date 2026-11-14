// Reporte de precio tal como lo ven las reglas de confiabilidad (#19) y de anómalos (#20). El
// reportante llega como una clave opaca: las reglas solo la comparan (RN5 de RF-011, EC-08).
export interface ScoredReport {
  reporterKey: string;
  priceCop: number;
  priceType: 'normal' | 'oferta';
  observedAt: Date;
}

export interface ReportWindow {
  candidate: ScoredReport;
  others: ScoredReport[];
  now: Date;
  ttlDays: number;
}

export const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Grill de la #19 (pregunta 2) y de la #20 (pregunta 2): de la ventana de vigencia (edad ≤ TTL), del
// mismo tipo de precio, sin la cuenta del candidato, y una vez por cuenta con su reporte más reciente.
export function comparableReports({
  candidate,
  others,
  now,
  ttlDays,
}: ReportWindow): ScoredReport[] {
  const windowStart = now.getTime() - ttlDays * DAY_IN_MILLISECONDS;
  const latest = new Map<string, ScoredReport>();
  for (const other of others) {
    const comparable =
      other.reporterKey !== candidate.reporterKey &&
      other.priceType === candidate.priceType &&
      other.observedAt.getTime() >= windowStart;
    if (!comparable) continue;
    const kept = latest.get(other.reporterKey);
    if (!kept || other.observedAt > kept.observedAt) latest.set(other.reporterKey, other);
  }
  return [...latest.values()];
}
