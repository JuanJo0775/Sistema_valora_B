import {
  comparableReports,
  DAY_IN_MILLISECONDS,
  type ReportWindow,
  type ScoredReport,
} from './report-window';

// Grill de la #20, pregunta 7: valores PROVISIONALES (ADR-005), reemplazables al llamar.
export const ANOMALY_PARAMS = {
  // Pregunta 4: cuentas de referencia necesarias para confiar en la mediana.
  minReferences: 3,
  // Pregunta 3: desviación máxima frente a la mediana, hacia arriba o hacia abajo.
  maxDeviation: 0.4,
  // Pregunta 5: cuántas cuentas nuevas, a qué distancia de precio y en qué ventana forman un grupo.
  coordination: { minAccounts: 3, windowMinutes: 60, newAccountDays: 7, priceTolerance: 0.05 },
};

export type AnomalyParams = typeof ANOMALY_PARAMS;

export interface AnomalyInput extends ReportWindow {
  // Pregunta 5: cuándo se creó la cuenta de una clave opaca (para saber si es nueva).
  accountCreatedAt: (reporterKey: string) => Date;
  // Grill de la #31, pregunta 7: reportes de las otras tiendas de la zona; completan la referencia
  // cuando la tienda no tiene suficientes cuentas.
  zone?: ScoredReport[];
}

export type AnomalyResult =
  | { status: 'normal'; median: number; deviation: number; references: number }
  | {
      status: 'sospechoso';
      reason: 'rango' | 'coordinacion';
      median: number;
      deviation: number;
      references: number;
    }
  | { status: 'sin_datos'; references: number };

// Pregunta 4: con un número par de valores, el promedio de los dos del medio. Se llama con al menos
// minReferences valores.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

// Pregunta 5: reportes de cuentas nuevas con «el mismo precio» del candidato, cerca en el tiempo.
function coordinatedWith(
  input: AnomalyInput,
  references: ScoredReport[],
  params: AnomalyParams,
): ScoredReport[] {
  const { candidate, now, accountCreatedAt } = input;
  const { newAccountDays, priceTolerance, windowMinutes } = params.coordination;
  const isNew = (report: ScoredReport) =>
    now.getTime() - accountCreatedAt(report.reporterKey).getTime() <
    newAccountDays * DAY_IN_MILLISECONDS;
  if (!isNew(candidate)) return [];
  return references.filter(
    (reference) =>
      isNew(reference) &&
      Math.abs(reference.priceCop - candidate.priceCop) / candidate.priceCop <= priceTolerance &&
      Math.abs(reference.observedAt.getTime() - candidate.observedAt.getTime()) <=
        windowMinutes * 60 * 1000,
  );
}

interface Measured {
  median: number;
  deviation: number;
  references: number;
}

// Pregunta 3: qué tanto se aparta el candidato de la mediana de las referencias.
function measure(candidate: ScoredReport, references: ScoredReport[]): Measured {
  const usual = median(references.map((reference) => reference.priceCop));
  const deviation = Math.abs(candidate.priceCop - usual) / usual;
  return { median: usual, deviation, references: references.length };
}

export function assessAnomaly(
  input: AnomalyInput,
  params: AnomalyParams = ANOMALY_PARAMS,
): AnomalyResult {
  // Pregunta 4: con pocas cuentas, un solo reporte falso movería la «mediana»; no se marca.
  const notEnough = (references: ScoredReport[]) => references.length < params.minReferences;
  const inStore = comparableReports(input);
  const references =
    notEnough(inStore) && input.zone
      ? comparableReports({ ...input, others: [...input.others, ...input.zone] })
      : inStore;
  if (notEnough(references)) return { status: 'sin_datos', references: references.length };

  // Pregunta 5: la mediana se mide sin el grupo, para que no la mueva hacia su propio precio. Varias
  // cuentas nuevas de acuerdo no son sospechosas por sí solas: el precio también debe ser raro.
  const group = coordinatedWith(input, references, params);
  if (group.length + 1 >= params.coordination.minAccounts) {
    const honest = references.filter((reference) => !group.includes(reference));
    if (notEnough(honest)) return { status: 'sin_datos', references: honest.length };
    const withoutGroup = measure(input.candidate, honest);
    if (withoutGroup.deviation > params.maxDeviation) {
      return { status: 'sospechoso', reason: 'coordinacion', ...withoutGroup };
    }
  }

  // Pregunta 3: «más de» X %, no «X % o más».
  const measured = measure(input.candidate, references);
  if (measured.deviation > params.maxDeviation) {
    return { status: 'sospechoso', reason: 'rango', ...measured };
  }
  return { status: 'normal', ...measured };
}
