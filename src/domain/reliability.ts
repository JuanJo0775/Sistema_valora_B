// Grill de la #19, pregunta 7: valores PROVISIONALES (ADR-005). Se calibran con datos y la
// calibración se documenta; las funciones aceptan otros parámetros.
export const RELIABILITY_PARAMS = {
  // Pregunta 2: otro precio a ±5 % del candidato lo corrobora.
  corroborationTolerance: 0.05,
  // Pregunta 5: pesos de la fórmula y tope de corroboraciones.
  reputationWeight: 0.5,
  corroborationWeight: 0.5,
  contradictionWeight: 0.5,
  maxCorroborations: 3,
};

export type ReliabilityParams = typeof RELIABILITY_PARAMS;

// Pregunta 8: el reportante llega como una clave opaca; la regla solo la compara (RN5, EC-08).
export interface ScoredReport {
  reporterKey: string;
  priceCop: number;
  priceType: 'normal' | 'oferta';
  observedAt: Date;
}

export interface ReliabilityInput {
  candidate: ScoredReport;
  // Los demás reportes de la misma presentación en la misma tienda.
  others: ScoredReport[];
  reputationOf: (reporterKey: string) => number;
  now: Date;
  ttlDays: number;
}

export interface ReliabilityResult {
  score: number;
  corroborations: number;
  contradictions: number;
}

// Pregunta 2 y RN4: sin la cuenta del candidato, y una vez por cuenta con su reporte más reciente.
function latestPerOtherAccount(candidate: ScoredReport, others: ScoredReport[]): ScoredReport[] {
  const latest = new Map<string, ScoredReport>();
  for (const other of others) {
    if (other.reporterKey === candidate.reporterKey) continue;
    const kept = latest.get(other.reporterKey);
    if (!kept || other.observedAt > kept.observedAt) latest.set(other.reporterKey, other);
  }
  return [...latest.values()];
}

export function reliabilityScore(
  input: ReliabilityInput,
  params: ReliabilityParams = RELIABILITY_PARAMS,
): ReliabilityResult {
  const { candidate } = input;
  const others = latestPerOtherAccount(candidate, input.others);
  const agrees = (other: ScoredReport) =>
    Math.abs(other.priceCop - candidate.priceCop) / candidate.priceCop <=
    params.corroborationTolerance;
  const corroborations = others.filter(agrees).length;
  const contradictions = others.length - corroborations;
  const score =
    params.reputationWeight * input.reputationOf(candidate.reporterKey) +
    (params.corroborationWeight * corroborations) / params.maxCorroborations -
    (params.contradictionWeight * contradictions) / params.maxCorroborations;
  return { score, corroborations, contradictions };
}
