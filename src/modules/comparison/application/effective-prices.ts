import type { PriceSource } from '../../../domain/initial-price';
import type { Discrepancy } from '../../../domain/official-vs-reported';
import type { CurrentPrice } from './current-prices';
import type { OfficialPriceCopy } from './official-price-copies';
import type { StoreReports } from './official-resolution';

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

export async function effectivePrices({
  current,
  officials,
}: EffectivePricesInput): Promise<EffectivePrice[]> {
  const withOfficial = new Set(officials.map(placeOf));
  const community = current.filter((price) => !withOfficial.has(placeOf(price)));
  return Promise.resolve([
    ...community,
    ...officials.map((official): EffectivePrice => ({
      presentationId: official.presentationId,
      establishmentId: official.establishmentId,
      priceCop: official.priceCop,
      observedAt: official.confirmedAt,
      status: 'vigente',
      source: 'oficial',
    })),
  ]);
}
