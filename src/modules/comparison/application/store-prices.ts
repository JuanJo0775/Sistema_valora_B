import type { PriceSource } from '../../../domain/initial-price';
import { type Freshness, ttlDaysFor } from '../../../domain/freshness';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { PresentationForPricing } from '../../catalog';
import type { EstablishmentDetail } from '../../establishments';
import type { PriceRef, PriceReliability } from '../../reliability';
import { freshnessAt } from './compare-product';
import type { CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de establishments, catalog y reliability (por su index.ts).
export interface StorePricesPorts {
  stores: { find(establishmentId: string): Promise<EstablishmentDetail | null> };
  presentations: { of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> };
  prices: Pick<CurrentPrices, 'findByEstablishment'>;
  reliability: { of(prices: PriceRef[], ttlDays: number): Promise<PriceReliability[]> };
  clock: { now(): Date };
}

// Grill de la #28, pregunta 1: la misma forma de cada resultado de la comparación, sin la distancia.
export interface StorePriceItem {
  productId: string;
  presentationId: string;
  productName: string;
  reportId: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // B#135: de la comunidad o un dato inicial de la semilla.
  source: PriceSource;
  freshness: Freshness;
  reliability: 'alta' | 'media' | 'baja' | 'en_revision';
  confirmations: number;
  observedAt: Date;
}

export interface StorePricesResult {
  establishment: EstablishmentDetail;
  prices: StorePriceItem[];
}

// RF-008: los precios vigentes de una tienda, leídos de price_current.
export class StorePrices {
  constructor(private readonly ports: StorePricesPorts) {}

  async of(
    establishmentId: string,
    options: { onlyCurrent: boolean },
  ): Promise<StorePricesResult | null> {
    const { stores, presentations, prices, reliability, clock } = this.ports;
    const establishment = await stores.find(establishmentId);
    if (!establishment) return null;
    const current = await prices.findByEstablishment(establishmentId);
    const known = await presentations.of(current.map((price) => price.presentationId));
    const now = clock.now();

    // Un precio de una presentación que ya no está en el catálogo no se muestra.
    const rows = current.flatMap((price) => {
      const presentation = known.get(price.presentationId);
      return presentation
        ? [{ price, presentation, ttlDays: ttlDaysFor(presentation.isFresh) }]
        : [];
    });
    const assessed = await this.reliabilityOf(rows, reliability);

    const items = rows.map(({ price, presentation, ttlDays }) => {
      const inReview = price.status === 'en_revision';
      const level = assessed.get(price.reportId);
      return {
        productId: presentation.productId,
        presentationId: price.presentationId,
        productName: presentation.label,
        reportId: price.reportId,
        priceCop: price.priceCop,
        unitPrice: calculateUnitPrice(price.priceCop, presentation),
        source: price.source,
        freshness: freshnessAt(price.observedAt, now, ttlDays),
        // Sin evaluación (precios anteriores a la #31) cuenta como baja, como en la comparación.
        reliability: inReview ? ('en_revision' as const) : (level?.level ?? 'baja'),
        confirmations: inReview ? 0 : (level?.confirmations ?? 0),
        observedAt: price.observedAt,
      };
    });
    // Grill de la #28, pregunta 2: como en la comparación, onlyCurrent quita los desactualizados y
    // los que están en revisión.
    const shown = options.onlyCurrent
      ? items.filter(
          (item) => item.freshness !== 'desactualizado' && item.reliability !== 'en_revision',
        )
      : items;
    shown.sort((a, b) => a.productName.localeCompare(b.productName, 'es'));
    return { establishment, prices: shown };
  }

  // La confiabilidad se calcula con el TTL de la categoría de cada presentación (fresca o no).
  private async reliabilityOf(
    rows: {
      price: { reportId: string; presentationId: string; establishmentId: string; status: string };
      ttlDays: number;
    }[],
    reliability: StorePricesPorts['reliability'],
  ): Promise<Map<string, PriceReliability>> {
    const byTtl = new Map<number, PriceRef[]>();
    for (const { price, ttlDays } of rows) {
      if (price.status === 'en_revision') continue;
      const refs = byTtl.get(ttlDays) ?? [];
      refs.push({
        presentationId: price.presentationId,
        establishmentId: price.establishmentId,
        reportId: price.reportId,
      });
      byTtl.set(ttlDays, refs);
    }
    const results = await Promise.all(
      [...byTtl].map(([ttlDays, refs]) => reliability.of(refs, ttlDays)),
    );
    return new Map(results.flat().map((assessed) => [assessed.reportId, assessed]));
  }
}
