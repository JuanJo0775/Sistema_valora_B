export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'und';

export interface Presentation {
  quantity: number;
  unit: Unit;
  packCount?: number;
}

export type UnitPricePer = '100g' | '100ml' | 'und';

// El valor exacto es interno: solo sirve para comparar y nunca se expone ni se serializa.
export class UnitPrice {
  readonly #exactCop: number;

  constructor(
    readonly per: UnitPricePer,
    exactCop: number,
  ) {
    this.#exactCop = exactCop;
  }

  get displayCop(): number {
    return Math.round(this.#exactCop);
  }

  compareTo(other: UnitPrice): number {
    return this.#exactCop - other.#exactCop;
  }
}

// factor: unidades base que hay en la unidad recibida; shownPer: unidades base por las que se muestra el precio
const BASE_UNIT: Record<Unit, { per: UnitPricePer; factor: number; shownPer: number }> = {
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

export class InvalidPriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPriceError';
  }
}

export function calculateUnitPrice(priceCop: number, presentation: Presentation): UnitPrice {
  if (!Number.isSafeInteger(priceCop) || priceCop < 1) {
    throw new InvalidPriceError('El precio debe ser un entero en pesos mayor o igual a $1.');
  }
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
  return new UnitPrice(per, (priceCop * shownPer) / baseQuantity);
}

export function compareUnitPrices(a: UnitPrice, b: UnitPrice): number {
  return a.compareTo(b);
}
