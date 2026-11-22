import type { PriceSource } from '../../../domain/initial-price';
import type { Discrepancy } from '../../../domain/official-vs-reported';
import type { CurrentPrice } from './current-prices';
import type { OfficialPriceCopy } from './official-price-copies';
import { resolveOfficial, type StoreReports } from './official-resolution';

// #218: el precio que se muestra de una presentación en una tienda, con la misma regla en la
// comparación, la ficha de la tienda, la canasta de hoy y el conteo de precios.
export interface EffectivePrice extends Omit<CurrentPrice, 'reportId' | 'source'> {
  // Un precio oficial no viene de un reporte (#204).
  reportId?: string;
  source: PriceSource | 'oficial';
  // D1: la comunidad corrobora otro precio; el oficial va al lado.
  discrepancy?: Discrepancy;
}

export interface EffectivePricesInput {
  current: CurrentPrice[];
  officials: OfficialPriceCopy[];
  reliability: StoreReports;
  // La vigencia de la categoría de cada presentación (ADR-005).
  ttlDaysOf(presentationId: string): number;
  now: Date;
}

const placeOf = (place: { presentationId: string; establishmentId: string }) =>
  `${place.presentationId}:${place.establishmentId}`;

// D1 y ADR-008: el oficial, o la mediana de la comunidad si la corrobora (con el oficial al lado).
async function officialOrReported(
  official: OfficialPriceCopy,
  { reliability, ttlDaysOf, now }: EffectivePricesInput,
): Promise<EffectivePrice> {
  const place = {
    presentationId: official.presentationId,
    establishmentId: official.establishmentId,
    status: 'vigente' as const,
  };
  const ttlDays = ttlDaysOf(official.presentationId);
  const { resolved, reports } = await resolveOfficial(official, reliability, now, ttlDays);
  const chosen =
    resolved.kind === 'discrepancia'
      ? reports.find((report) => report.reportId === resolved.reportId)
      : undefined;
  if (resolved.kind === 'oficial' || !chosen) {
    return {
      ...place,
      priceCop: official.priceCop,
      observedAt: official.confirmedAt,
      source: 'oficial',
    };
  }
  return {
    reportId: chosen.reportId,
    ...place,
    priceCop: chosen.priceCop,
    observedAt: chosen.observedAt,
    source: 'comunidad',
    discrepancy: resolved.discrepancy,
  };
}

export async function effectivePrices(input: EffectivePricesInput): Promise<EffectivePrice[]> {
  const { current, officials } = input;
  const withOfficial = new Set(officials.map(placeOf));
  const community = current.filter((price) => !withOfficial.has(placeOf(price)));
  const resolved: EffectivePrice[] = [];
  for (const official of officials) resolved.push(await officialOrReported(official, input));
  return [...community, ...resolved];
}
