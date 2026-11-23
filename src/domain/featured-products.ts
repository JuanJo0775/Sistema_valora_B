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
// solo un desempate estable) y al final el id, que hace el orden total: así las páginas seguidas no
// repiten ni saltan productos.
function sortFeatured<T extends FeaturedCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort(
    (a, b) =>
      b.storeCount - a.storeCount ||
      a.unitPrice.displayCop - b.unitPrice.displayCop ||
      compareIds(a.productId, b.productId),
  );
}

export function rankFeaturedProducts<T extends FeaturedCandidate>(
  candidates: readonly T[],
  limit: number,
): T[] {
  return sortFeatured(candidates).slice(0, limit);
}

export interface FeaturedPage<T> {
  items: T[];
  // Productos destacables con los mismos filtros, sin importar la página.
  total: number;
  hasMore: boolean;
}

// Paginación por desplazamiento sobre el mismo orden. Se ordena todo en memoria y solo se recorta:
// con unos cientos de productos basta. Si el catálogo con precio pasa de unos pocos miles, hay que
// llevar el orden y el recorte a la consulta (o a una vista materializada del conteo por producto).
export function pageFeaturedProducts<T extends FeaturedCandidate>(
  candidates: readonly T[],
  { limit, offset }: { limit: number; offset: number },
): FeaturedPage<T> {
  const items = sortFeatured(candidates).slice(offset, offset + limit);
  return {
    items,
    total: candidates.length,
    hasMore: offset + items.length < candidates.length,
  };
}
