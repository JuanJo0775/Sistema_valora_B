import type { UnitPrice } from './unit-price';

// Lo único que la regla lee de cada producto: cuántas tiendas tienen precio vigente y el más bajo.
export interface FeaturedCandidate {
  productId: string;
  storeCount: number;
  unitPrice: UnitPrice;
}

// Comparación carácter por carácter, sin depender del idioma de la máquina.
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// B#120: la canasta básica de hoy son los productos con más tiendas con precio vigente. En empate,
// el menor precio por unidad que se muestra (entre productos de bases distintas, 100 g o unidad, es
// solo un desempate estable) y al final el id.
export function rankFeaturedProducts<T extends FeaturedCandidate>(
  candidates: readonly T[],
  limit: number,
): T[] {
  return [...candidates]
    .sort(
      (a, b) =>
        b.storeCount - a.storeCount ||
        a.unitPrice.displayCop - b.unitPrice.displayCop ||
        compareIds(a.productId, b.productId),
    )
    .slice(0, limit);
}
