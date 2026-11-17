import { IncompatibleUnitsError, type UnitPrice } from './unit-price';

// Lo único que la regla lee de cada precio vigente: su tienda y su precio por unidad.
export interface PricedOffer {
  establishmentId: string;
  unitPrice: UnitPrice;
}

// B#128 (EC-06): «hasta X % menos que la tienda más cara». Compara el precio por unidad más bajo con
// el más alto. Sin dos tiendas distintas, o con bases que no se pueden comparar, no hay ahorro.
export function savingsPercent(offers: readonly PricedOffer[]): number | undefined {
  if (new Set(offers.map(({ establishmentId }) => establishmentId)).size < 2) return undefined;
  try {
    const sorted = [...offers].sort((a, b) => a.unitPrice.compareTo(b.unitPrice));
    const cheapest = sorted[0];
    const priciest = sorted.at(-1);
    if (!cheapest || !priciest) return undefined;
    return cheapest.unitPrice.percentBelow(priciest.unitPrice);
  } catch (error) {
    if (error instanceof IncompatibleUnitsError) return undefined;
    throw error;
  }
}
