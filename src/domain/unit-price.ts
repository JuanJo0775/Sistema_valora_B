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

export class InvalidQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  const { quantity, packCount = 1 } = presentation;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new InvalidQuantityError('La cantidad de la presentación debe ser mayor que cero.');
  }
  if (!Number.isInteger(packCount) || packCount <= 0) {
    throw new InvalidQuantityError(
      'El número de unidades del empaque debe ser un entero mayor que cero.',
    );
  }
  const { per, factor, shownPer } = BASE_UNIT[presentation.unit];
  const baseQuantity = quantity * factor * packCount;
  return { per, displayCop: Math.round((priceCop * shownPer) / baseQuantity) };
}
