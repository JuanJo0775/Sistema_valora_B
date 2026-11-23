// D1 del grill comercial (ADR-008, ADR-024): qué precio entra al orden neutral cuando una tienda
// tiene precio oficial y la comunidad reporta otro.

// Un reporte de la tienda y la presentación. Los reportes ya vienen uno por persona (independientes).
export interface ReportedPrice {
  reportId: string;
  priceCop: number;
  observedAt: Date;
  // Confiabilidad media o alta (ADR-007).
  reliable: boolean;
}

export interface OfficialVsReportedInput {
  // changedAt: la última vez que el comercio cambió el precio (reconfirmar no cuenta).
  official: { priceCop: number; changedAt: Date };
  reports: ReportedPrice[];
  now: Date;
  // Vigencia de la categoría (ADR-005).
  ttlDays: number;
}

export interface Discrepancy {
  officialPriceCop: number;
  reportedPriceCop: number;
  // Cuántos reportes la corroboran y desde cuándo (el más antiguo de ellos).
  reports: number;
  since: Date;
}

export type OfficialVsReported =
  | { kind: 'oficial'; priceCop: number }
  // Entra al orden la mediana de los reportes que corroboran; reportId es el de ese reporte.
  | { kind: 'discrepancia'; priceCop: number; reportId: string; discrepancy: Discrepancy };

// ADR-008: valores PROVISIONALES y configurables en un solo lugar.
export const DISCREPANCY_PARAMS = { threshold: 0.05, minReports: 2 } as const;

// Con un número par, el menor de los dos centrales: siempre es un precio que alguien vio (D1).
function median(reports: ReportedPrice[]): ReportedPrice {
  const sorted = [...reports].sort((a, b) => a.priceCop - b.priceCop);
  return sorted[Math.floor((sorted.length - 1) / 2)] as ReportedPrice;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Los reportes que corroboran una discrepancia, o [] si no hay discrepancia corroborada.
function corroborating({
  official,
  reports,
  now,
  ttlDays,
}: OfficialVsReportedInput): ReportedPrice[] {
  // D1: solo cuentan los reportes confiables, vigentes (ADR-005) y posteriores al último cambio de
  // precio del oficial.
  const oldest = now.getTime() - ttlDays * DAY_IN_MILLISECONDS;
  const recent = reports.filter(
    (r) => r.reliable && r.observedAt > official.changedAt && r.observedAt.getTime() >= oldest,
  );
  // Precisión de D1: corroboran los del mismo lado del oficial (más caros o más baratos)...
  const margin = official.priceCop * DISCREPANCY_PARAMS.threshold;
  const higher = recent.filter((r) => r.priceCop > official.priceCop + margin);
  const lower = recent.filter((r) => r.priceCop < official.priceCop - margin);
  const [side, opposite] = higher.length >= lower.length ? [higher, lower] : [lower, higher];
  // ...y son más que los que coinciden con el oficial y que los del otro lado.
  const agreeing = recent.length - higher.length - lower.length;
  const corroborated =
    side.length >= DISCREPANCY_PARAMS.minReports &&
    side.length > agreeing &&
    side.length > opposite.length;
  return corroborated ? side : [];
}

export function officialVsReported(input: OfficialVsReportedInput): OfficialVsReported {
  const { official } = input;
  const reports = corroborating(input);
  if (reports.length === 0) return { kind: 'oficial', priceCop: official.priceCop };
  const chosen = median(reports);
  return {
    kind: 'discrepancia',
    priceCop: chosen.priceCop,
    reportId: chosen.reportId,
    discrepancy: {
      officialPriceCop: official.priceCop,
      reportedPriceCop: chosen.priceCop,
      reports: reports.length,
      since: new Date(Math.min(...reports.map((r) => r.observedAt.getTime()))),
    },
  };
}
