import { comparableReports, type ReportWindow } from './report-window';

// Grill de la #20, pregunta 7: valores PROVISIONALES (ADR-005), reemplazables al llamar.
export const ANOMALY_PARAMS = {
  // Pregunta 4: cuentas de referencia necesarias para confiar en la mediana.
  minReferences: 3,
  // Pregunta 3: desviación máxima frente a la mediana, hacia arriba o hacia abajo.
  maxDeviation: 0.4,
};

export type AnomalyParams = typeof ANOMALY_PARAMS;

export interface AnomalyInput extends ReportWindow {
  // Pregunta 5: cuándo se creó la cuenta de una clave opaca (para saber si es nueva).
  accountCreatedAt: (reporterKey: string) => Date;
}

export type AnomalyResult =
  | { status: 'normal'; median: number; deviation: number; references: number }
  | { status: 'sospechoso'; reason: 'rango'; median: number; deviation: number; references: number }
  | { status: 'sin_datos'; references: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function assessAnomaly(
  input: AnomalyInput,
  params: AnomalyParams = ANOMALY_PARAMS,
): AnomalyResult {
  const references = comparableReports(input);
  // Pregunta 4: con pocas cuentas, un solo reporte falso movería la «mediana»; no se marca.
  if (references.length < params.minReferences) {
    return { status: 'sin_datos', references: references.length };
  }
  const usual = median(references.map((reference) => reference.priceCop));
  const deviation = Math.abs(input.candidate.priceCop - usual) / usual;
  const measured = { median: usual, deviation, references: references.length };
  // Pregunta 3: «más de» X %, no «X % o más».
  if (deviation > params.maxDeviation)
    return { status: 'sospechoso', reason: 'rango', ...measured };
  return { status: 'normal', ...measured };
}
