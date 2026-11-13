import type { SortCriterion } from '../../../domain/neutral-ranking';
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
  presentationId: string;
}

export interface Comparison {
  productId: string;
  // El orden declarado al usuario (EC-06).
  criteria: { sort: SortCriterion; radiusKm: number };
  results: ComparisonItem[];
  // ADR-009: siempre aparte; vacío hasta el módulo comercial (grill de la #15, pregunta 6).
  promotions: [];
}

export class CompareProduct {
  constructor(private readonly ports: CompareProductPorts) {}

  async execute(input: CompareProductInput): Promise<Comparison | null> {
    const product = await this.ports.products.find(input.productId);
    if (!product) return null;
    return {
      productId: product.id,
      criteria: { sort: input.sort, radiusKm: input.radiusKm },
      results: [],
      promotions: [],
    };
  }
}
