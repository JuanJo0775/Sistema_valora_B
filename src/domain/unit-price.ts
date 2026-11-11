export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'und';

export interface Presentation {
  quantity: number;
  unit: Unit;
  packCount?: number;
}

export interface UnitPrice {
  per: '100g' | '100ml' | 'und';
  displayCop: number;
}

// factor: cuántas unidades base hay en la unidad recibida; per: cuántas unidades base muestra el precio
const BASE_UNIT: Record<Unit, { per: UnitPrice['per']; factor: number; shownPer: number }> = {
  g: { per: '100g', factor: 1, shownPer: 100 },
  kg: { per: '100g', factor: 1000, shownPer: 100 },
  ml: { per: '100ml', factor: 1, shownPer: 100 },
  l: { per: '100ml', factor: 1000, shownPer: 100 },
  und: { per: 'und', factor: 1, shownPer: 1 },
};

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  const { per, factor, shownPer } = BASE_UNIT[presentation.unit];
  const baseQuantity = presentation.quantity * factor * (presentation.packCount ?? 1);
  return { per, displayCop: (priceCop * shownPer) / baseQuantity };
}
