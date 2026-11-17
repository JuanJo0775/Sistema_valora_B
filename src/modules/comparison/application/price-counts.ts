import { ttlDaysFor } from '../../../domain/freshness';
import type { PresentationForPricing } from '../../catalog';
import { freshnessAt } from './compare-product';
import type { CurrentPrices } from './current-prices';

// Puertos hacia la tabla propia (price_current) y la consulta pública de catalog.
export interface PriceCountsPorts {
  prices: Pick<CurrentPrices, 'findByEstablishments'>;
  presentations: { of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> };
  clock: { now(): Date };
}

// B#131: cuántas presentaciones tienen hoy un precio vigente en cada tienda, para las tarjetas del
// mapa. El mismo criterio que GET /v1/establishments/{id}/prices con onlyCurrent: no cuentan los
// desactualizados ni los que están en revisión, ni los de presentaciones que ya no están en el
// catálogo; los por confirmar sí cuentan.
export class PriceCounts {
  constructor(private readonly ports: PriceCountsPorts) {}

  async of(establishmentIds: string[]): Promise<Map<string, number>> {
    const counts = new Map(establishmentIds.map((id) => [id, 0]));
    if (establishmentIds.length === 0) return counts;
    const { prices, presentations, clock } = this.ports;
    const current = await prices.findByEstablishments(establishmentIds);
    const known = await presentations.of([...new Set(current.map((p) => p.presentationId))]);
    const now = clock.now();
    for (const price of current) {
      const presentation = known.get(price.presentationId);
      if (!presentation || price.status === 'en_revision') continue;
      const ttlDays = ttlDaysFor(presentation.isFresh);
      if (freshnessAt(price.observedAt, now, ttlDays) === 'desactualizado') continue;
      counts.set(price.establishmentId, (counts.get(price.establishmentId) ?? 0) + 1);
    }
    return counts;
  }
}
