export type Unit = 'g' | 'kg';

export interface Presentation {
  quantity: number;
  unit: Unit;
}

export interface UnitPrice {
  per: '100g';
  displayCop: number;
}

const GRAMS_PER_UNIT: Record<Unit, number> = { g: 1, kg: 1000 };

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  const grams = presentation.quantity * GRAMS_PER_UNIT[presentation.unit];
  return { per: '100g', displayCop: (priceCop * 100) / grams };
}
