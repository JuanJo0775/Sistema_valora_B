import { comparableReports, type ReportWindow } from './report-window';

export interface AnomalyInput extends ReportWindow {
  // Pregunta 5: cuándo se creó la cuenta de una clave opaca (para saber si es nueva).
  accountCreatedAt: (reporterKey: string) => Date;
}

export type AnomalyResult = { status: 'sin_datos'; references: number };

export function assessAnomaly(input: AnomalyInput): AnomalyResult {
  return { status: 'sin_datos', references: comparableReports(input).length };
}
