import { type FeaturedCandidate, rankFeaturedProducts } from './featured-products';
import { calculateUnitPrice } from './unit-price';

// Producto de prueba: por defecto, 500 g a $2.000 ($400 por 100 g) en una tienda.
function candidate(
  productId: string,
  storeCount: number,
  priceCop = 2000,
): FeaturedCandidate & { productId: string } {
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
