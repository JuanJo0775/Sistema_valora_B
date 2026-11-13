import { type Freshness, freshnessOf } from '../../../domain/freshness';
import type { SortCriterion } from '../../../domain/neutral-ranking';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { ProductForComparisonView } from '../../catalog';
import type { NearbyEstablishment, WithinRadiusQuery } from '../../establishments';
import type { CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de catalog y establishments (grill de la #15, pregunta 2).
export interface ProductLookup {
  find(productId: string): Promise<ProductForComparisonView | null>;
}

export interface StoresWithinRadius {
  find(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
}

export interface Clock {
  now(): Date;
}

export interface CompareProductPorts {
  products: ProductLookup;
  stores: StoresWithinRadius;
  prices: CurrentPrices;
  clock: Clock;
}

export interface CompareProductInput {
  productId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  sort: SortCriterion;
  onlyCurrent: boolean;
}

export interface ComparisonItem {
  establishment: NearbyEstablishment;
  presentationId: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // Grill de la #15, pregunta 7: hoy todo precio viene de reportes de la comunidad.
  source: 'comunidad';
  freshness: Freshness;
  observedAt: Date;
}

export interface Comparison {
  productId: string;
  // El orden declarado al usuario (EC-06).
  criteria: { sort: SortCriterion; radiusKm: number };
  results: ComparisonItem[];
  // ADR-009: siempre aparte; vacío hasta el módulo comercial (grill de la #15, pregunta 6).
  promotions: [];
}

const TTL_DAYS = 14;

export class CompareProduct {
  constructor(private readonly ports: CompareProductPorts) {}

  async execute(input: CompareProductInput): Promise<Comparison | null> {
    const product = await this.ports.products.find(input.productId);
    if (!product) return null;

    const presentations = new Map(product.presentations.map((p) => [p.id, p]));
    const prices = await this.ports.prices.findByPresentations([...presentations.keys()]);
    const stores = await this.ports.stores.find({
      ids: [...new Set(prices.map((price) => price.establishmentId))],
      lat: input.lat,
      lng: input.lng,
      radiusMeters: input.radiusKm * 1000,
    });
    const storesById = new Map(stores.map((store) => [store.id, store]));
    const now = this.ports.clock.now();

    const results: ComparisonItem[] = [];
    for (const price of prices) {
      const establishment = storesById.get(price.establishmentId);
      const presentation = presentations.get(price.presentationId);
      if (!establishment || !presentation) continue;
      results.push({
        establishment,
        presentationId: price.presentationId,
        priceCop: price.priceCop,
        unitPrice: calculateUnitPrice(price.priceCop, presentation),
        source: 'comunidad',
        freshness: freshnessOf({ observedAt: price.observedAt, now, ttlDays: TTL_DAYS }),
        observedAt: price.observedAt,
      });
    }

    return {
      productId: product.id,
      criteria: { sort: input.sort, radiusKm: input.radiusKm },
      results,
      promotions: [],
    };
  }
}
