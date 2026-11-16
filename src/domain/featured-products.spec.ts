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
});
