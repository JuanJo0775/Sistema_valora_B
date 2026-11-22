import {
  type FeaturedCandidate,
  pageFeaturedProducts,
  rankFeaturedProducts,
} from './featured-products';
import { calculateUnitPrice } from './unit-price';

// Producto de prueba: por defecto, 500 g a $2.000 ($400 por 100 g) en una tienda.
function candidate(productId: string, storeCount: number, priceCop = 2000): FeaturedCandidate {
  return {
    productId,
    storeCount,
    unitPrice: calculateUnitPrice(priceCop, { quantity: 500, unit: 'g' }),
  };
}

describe('canasta básica de hoy (B#120)', () => {
  it('primero el producto que más tiendas del municipio tienen con precio vigente', () => {
    const ranked = rankFeaturedProducts(
      [candidate('arroz', 2), candidate('leche', 5), candidate('huevos', 3)],
      10,
    );

    expect(ranked.map(({ productId }) => productId)).toEqual(['leche', 'huevos', 'arroz']);
  });

  it('con las mismas tiendas, primero el de menor precio por unidad y luego el de menor id', () => {
    const ranked = rankFeaturedProducts(
      [candidate('panela', 3, 2400), candidate('azucar', 3, 2400), candidate('arroz', 3, 2000)],
      10,
    );

    expect(ranked.map(({ productId }) => productId)).toEqual(['arroz', 'azucar', 'panela']);
  });

  it('desempata con el precio por unidad que se muestra aunque las bases sean distintas', () => {
    // $300 por unidad frente a $400 por 100 g: no es una comparación de precios, solo un desempate estable.
    const huevo = {
      productId: 'huevo',
      storeCount: 3,
      unitPrice: calculateUnitPrice(9000, { quantity: 30, unit: 'und' }),
    };

    const ranked = rankFeaturedProducts([candidate('arroz', 3), huevo], 10);

    expect(ranked.map(({ productId }) => productId)).toEqual(['huevo', 'arroz']);
  });

  it('devuelve como mucho los productos que se piden', () => {
    const ranked = rankFeaturedProducts(
      [candidate('arroz', 2), candidate('leche', 5), candidate('huevos', 3)],
      2,
    );

    expect(ranked.map(({ productId }) => productId)).toEqual(['leche', 'huevos']);
  });
});

describe('página de la canasta básica por desplazamiento', () => {
  const pool = [
    candidate('e', 1),
    candidate('a', 5),
    candidate('c', 3),
    candidate('b', 3),
    candidate('d', 2),
  ];
  const ids = (items: { productId: string }[]) => items.map(({ productId }) => productId);

  it('recorta con offset y limit y dice el total y si hay más', () => {
    const page = pageFeaturedProducts(pool, { limit: 2, offset: 1 });

    expect(ids(page.items)).toEqual(['b', 'c']);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });

  it('la última página no tiene más', () => {
    const page = pageFeaturedProducts(pool, { limit: 2, offset: 4 });

    expect(ids(page.items)).toEqual(['e']);
    expect(page.hasMore).toBe(false);
  });

  it('una página justo al final no tiene más aunque llene el limit', () => {
    const page = pageFeaturedProducts(pool, { limit: 2, offset: 3 });

    expect(ids(page.items)).toEqual(['d', 'e']);
    expect(page.hasMore).toBe(false);
  });

  it('más allá del final, la página sale vacía y conserva el total', () => {
    const page = pageFeaturedProducts(pool, { limit: 5, offset: 40 });

    expect(page).toEqual({ items: [], total: 5, hasMore: false });
  });

  it('sin candidatos, vacío', () => {
    expect(pageFeaturedProducts([], { limit: 5, offset: 0 })).toEqual({
      items: [],
      total: 0,
      hasMore: false,
    });
  });

  it('las páginas seguidas, sin importar el orden de entrada, no repiten ni saltan productos', () => {
    const shuffled = [...pool].reverse();
    const pages = [0, 2, 4].flatMap((offset) =>
      ids(pageFeaturedProducts(shuffled, { limit: 2, offset }).items),
    );

    expect(pages).toEqual(ids(rankFeaturedProducts(pool, 10)));
    expect(new Set(pages).size).toBe(pool.length);
  });
});
