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

export type OfficialVsReported = { kind: 'oficial'; priceCop: number };

export function officialVsReported({ official }: OfficialVsReportedInput): OfficialVsReported {
  return { kind: 'oficial', priceCop: official.priceCop };
}
