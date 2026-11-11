export type Unit = 'g' | 'kg' | 'ml' | 'l';

export interface Presentation {
  quantity: number;
  unit: Unit;
  packCount?: number;
}

export interface UnitPrice {
  per: '100g' | '100ml';
  displayCop: number;
}

const BASE_UNIT: Record<Unit, { per: UnitPrice['per']; factor: number }> = {
  g: { per: '100g', factor: 1 },
  kg: { per: '100g', factor: 1000 },
  ml: { per: '100ml', factor: 1 },
  l: { per: '100ml', factor: 1000 },
};

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  const { per, factor } = BASE_UNIT[presentation.unit];
  const baseQuantity = presentation.quantity * factor * (presentation.packCount ?? 1);
  return { per, displayCop: (priceCop * 100) / baseQuantity };
}
