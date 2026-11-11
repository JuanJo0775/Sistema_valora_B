export type Unit = 'g';

export interface Presentation {
  quantity: number;
  unit: Unit;
}

export interface UnitPrice {
  per: '100g';
  displayCop: number;
}

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  return { per: '100g', displayCop: (priceCop * 100) / presentation.quantity };
}
