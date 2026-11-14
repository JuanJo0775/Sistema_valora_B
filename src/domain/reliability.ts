import { comparableReports, DAY_IN_MILLISECONDS, type ScoredReport } from './report-window';

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
  // Pregunta 3: cuánto sube con una confirmación y cuánto baja con un rechazo.
  reputationSteps: { corroborated: 0.05, rejected: 0.2 },
  // Pregunta 6: umbrales de los niveles.
  levels: { high: 0.6, medium: 0.25 },
};

export type ReliabilityParams = typeof RELIABILITY_PARAMS;

// Pregunta 8: el reportante llega como una clave opaca (ScoredReport, en report-window.ts).
export type { ScoredReport } from './report-window';

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

const clamp = (value: number) => Math.min(1, Math.max(0, value));

// Pregunta 5: lo que dicen los reportes, sin la edad. Cada cuenta pesa según su reputación (neutra =
// 1) y el aporte se satura en el tope, para que muchas cuentas no empujen sin límite.
function evidenceOf(
  input: ReliabilityInput,
  supporting: ScoredReport[],
  opposing: ScoredReport[],
  params: ReliabilityParams,
): number {
  const weight = (reports: ScoredReport[]) =>
    reports.reduce(
      (total, other) => total + input.reputationOf(other.reporterKey) / params.neutralReputation,
      0,
    );
  const capped = (reports: ScoredReport[]) =>
    Math.min(weight(reports), params.maxCorroborations) / params.maxCorroborations;
  return clamp(
    params.reputationWeight * input.reputationOf(input.candidate.reporterKey) +
      params.corroborationWeight * capped(supporting) -
      params.contradictionWeight * capped(opposing),
  );
}

// Pregunta 4: decae en línea recta y llega a 0 a las 2 veces el TTL («desactualizado»). La edad
// cuenta desde el reporte más reciente entre el candidato y los que lo confirman: alguien lo acaba de
// ver. Una edad negativa (margen de relojes de la #14) cuenta como 0.
function ageFactor(input: ReliabilityInput, supporting: ScoredReport[]): number {
  const seen = [input.candidate, ...supporting].map((report) => report.observedAt.getTime());
  const ageDays = Math.max(0, input.now.getTime() - Math.max(...seen)) / DAY_IN_MILLISECONDS;
  return Math.max(0, 1 - ageDays / (2 * input.ttlDays));
}

export function reliabilityScore(
  input: ReliabilityInput,
  params: ReliabilityParams = RELIABILITY_PARAMS,
): ReliabilityResult {
  const { candidate } = input;
  const agrees = (other: ScoredReport) =>
    Math.abs(other.priceCop - candidate.priceCop) / candidate.priceCop <=
    params.corroborationTolerance;
  const others = comparableReports(input);
  const supporting = others.filter(agrees);
  const opposing = others.filter((other) => !agrees(other));
  return {
    score: ageFactor(input, supporting) * evidenceOf(input, supporting, opposing, params),
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

export type ReputationEvent = 'corroborated' | 'rejected';

// Pregunta 3: ganar confianza cuesta más que perderla. Guardarla y llamar a esta regla le toca a la
// #31 (corroboración) y a la moderación (#32, #33).
export function updateReputation(
  current: number,
  event: ReputationEvent,
  params: ReliabilityParams = RELIABILITY_PARAMS,
): number {
  const step =
    event === 'corroborated'
      ? params.reputationSteps.corroborated
      : -params.reputationSteps.rejected;
  return clamp(current + step);
}
