import type { UnitPrice } from './unit-price';

// Lo único que la regla lee de cada producto: cuántas tiendas tienen precio vigente y el más bajo.
export interface FeaturedCandidate {
  storeCount: number;
  unitPrice: UnitPrice;
}

// B#120: la canasta básica de hoy son los productos con más tiendas con precio vigente.
export function rankFeaturedProducts<T extends FeaturedCandidate>(
  candidates: readonly T[],
  limit: number,
): T[] {
  return [...candidates].sort((a, b) => b.storeCount - a.storeCount).slice(0, limit);
}
