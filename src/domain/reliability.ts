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
  // Pregunta 3: reputación de una cuenta nueva. Una cuenta neutra pesa 1 al corroborar.
  neutralReputation: 0.5,
  // Pregunta 6: umbrales de los niveles.
  levels: { high: 0.6, medium: 0.25 },
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

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Pregunta 2 y RN4: de la ventana de vigencia (edad ≤ TTL), del mismo tipo de precio, sin la cuenta
// del candidato, y una vez por cuenta con su reporte más reciente.
function comparableReports({ candidate, others, now, ttlDays }: ReliabilityInput): ScoredReport[] {
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

export function reliabilityScore(
  input: ReliabilityInput,
  params: ReliabilityParams = RELIABILITY_PARAMS,
): ReliabilityResult {
  const { candidate } = input;
  const others = comparableReports(input);
  const agrees = (other: ScoredReport) =>
    Math.abs(other.priceCop - candidate.priceCop) / candidate.priceCop <=
    params.corroborationTolerance;
  const supporting = others.filter(agrees);
  const opposing = others.filter((other) => !agrees(other));
  // Pregunta 5: cada cuenta pesa según su reputación (neutra = 1).
  const weight = (reports: ScoredReport[]) =>
    reports.reduce(
      (total, other) => total + input.reputationOf(other.reporterKey) / params.neutralReputation,
      0,
    );
  // Pregunta 5: el aporte se satura en el tope, para que muchas cuentas no empujen sin límite.
  const capped = (count: number) =>
    Math.min(count, params.maxCorroborations) / params.maxCorroborations;
  const raw =
    params.reputationWeight * input.reputationOf(candidate.reporterKey) +
    params.corroborationWeight * capped(weight(supporting)) -
    params.contradictionWeight * capped(weight(opposing));
  // Pregunta 4: decae en línea recta y llega a 0 a las 2 veces el TTL («desactualizado»). La edad
  // cuenta desde el reporte más reciente entre el candidato y los que lo confirman: alguien lo acaba
  // de ver. Una edad negativa (margen de relojes de la #14) cuenta como 0.
  const lastSeen = Math.max(...[candidate, ...supporting].map((seen) => seen.observedAt.getTime()));
  const ageDays = Math.max(0, input.now.getTime() - lastSeen) / DAY_IN_MILLISECONDS;
  const ageFactor = Math.max(0, 1 - ageDays / (2 * input.ttlDays));
  return {
    score: ageFactor * Math.min(1, Math.max(0, raw)),
    corroborations: supporting.length,
    contradictions: opposing.length,
  };
}

export type ReliabilityLevel = 'alta' | 'media' | 'baja';

// Pregunta 6: en_revision no sale del score, lo decide la moderación (#32).
export function reliabilityLevel(
  score: number,
  params: ReliabilityParams = RELIABILITY_PARAMS,
): ReliabilityLevel {
  if (score >= params.levels.high) return 'alta';
  if (score >= params.levels.medium) return 'media';
  return 'baja';
}
