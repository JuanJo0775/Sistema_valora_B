import { DomainError } from './domain-error';

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'und';

export interface Presentation {
  quantity: number;
  unit: Unit;
  packCount?: number;
}

export type UnitPricePer = '100g' | '100ml' | 'und';

// Fracción exacta con enteros grandes: evita los errores de la coma flotante (1.005 * 1000 = 1004.999…).
interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

// El valor exacto es interno: solo sirve para comparar y nunca se expone ni se serializa.
export class UnitPrice {
  readonly #exactCop: Fraction;

  constructor(
    readonly per: UnitPricePer,
    exactCop: Fraction,
  ) {
    this.#exactCop = exactCop;
  }

  // Redondeo al peso entero con la mitad hacia arriba: piso de (n / d + 1/2).
  get displayCop(): number {
    const { numerator, denominator } = this.#exactCop;
    return Number((2n * numerator + denominator) / (2n * denominator));
  }

  compareTo(other: UnitPrice): number {
    if (this.per !== other.per) {
      throw new IncompatibleUnitsError(
        `No se puede comparar un precio por ${this.per} con uno por ${other.per}.`,
      );
    }
    const a = this.#exactCop;
    const b = other.#exactCop;
    const difference = a.numerator * b.denominator - b.numerator * a.denominator;
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  }
}

// factor: unidades base que hay en la unidad recibida; shownPer: unidades base por las que se muestra el precio
const BASE_UNIT: Record<Unit, { per: UnitPricePer; factor: bigint; shownPer: bigint }> = {
  g: { per: '100g', factor: 1n, shownPer: 100n },
  kg: { per: '100g', factor: 1000n, shownPer: 100n },
  ml: { per: '100ml', factor: 1n, shownPer: 100n },
  l: { per: '100ml', factor: 1000n, shownPer: 100n },
  und: { per: 'und', factor: 1n, shownPer: 1n },
};

export class InvalidQuantityError extends DomainError {
  readonly code = 'INVALID_QUANTITY';
}

export class InvalidPriceError extends DomainError {
  readonly code = 'INVALID_PRICE';
}

export class IncompatibleUnitsError extends DomainError {
  readonly code = 'INCOMPATIBLE_UNITS';
}

// Lee el decimal tal como se escribió (String(0.1) es "0.1"), sin pasar por aritmética de coma flotante.
function toFraction(value: number): Fraction {
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  const [integerPart = '', decimalPart = ''] = mantissa.split('.');
  let numerator = BigInt(integerPart + decimalPart);
  let denominator = 10n ** BigInt(decimalPart.length);
  const power = Number(exponent);
  if (power > 0) numerator *= 10n ** BigInt(power);
  if (power < 0) denominator *= 10n ** BigInt(-power);
  return { numerator, denominator };
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
  const exactQuantity = toFraction(quantity);
  // precio × shownPer / (cantidad × factor × empaque), con la cantidad como fracción exacta
  return new UnitPrice(per, {
    numerator: BigInt(priceCop) * shownPer * exactQuantity.denominator,
    denominator: exactQuantity.numerator * factor * BigInt(packCount),
  });
}

export function compareUnitPrices(a: UnitPrice, b: UnitPrice): number {
  return a.compareTo(b);
}
