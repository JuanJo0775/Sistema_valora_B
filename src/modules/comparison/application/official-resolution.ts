import { officialVsReported, type OfficialVsReported } from '../../../domain/official-vs-reported';
import type { ReportAtStore } from '../../reliability';
import type { OfficialPriceCopy } from './official-price-copies';

// Los reportes recientes de una tienda, uno por persona, con su nivel (reliability, #204).
export interface StoreReports {
  reportsAt(
    presentationId: string,
    establishmentId: string,
    ttlDays: number,
  ): Promise<ReportAtStore[]>;
}

// D1 y ADR-008: el oficial, salvo que los reportes recientes y confiables corroboren otro precio.
// La usan la comparación (#204) y los avisos al comercio (#209).
export async function resolveOfficial(
  official: OfficialPriceCopy,
  reliability: StoreReports,
  now: Date,
  ttlDays: number,
): Promise<{ resolved: OfficialVsReported; reports: ReportAtStore[] }> {
  const reports = await reliability.reportsAt(
    official.presentationId,
    official.establishmentId,
    ttlDays,
  );
  const resolved = officialVsReported({
    official: { priceCop: official.priceCop, changedAt: official.priceChangedAt },
    reports: reports.map((report) => ({ ...report, reliable: report.level !== 'baja' })),
    now,
    ttlDays,
  });
  return { resolved, reports };
}
