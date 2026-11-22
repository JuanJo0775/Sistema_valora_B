import { colombiaDate } from './colombia-date';
import { DomainError } from './domain-error';
import type { Freshness } from './freshness';
import { PLAUSIBILITY_PARAMS } from './price-plausibility';

// D6 del grill comercial (ADR-009, ADR-026): las promociones de un comercio verificado. Van siempre
// aparte de los resultados de la comparación y nunca cambian el orden.

export type PromotionStatus = 'activa' | 'pausada' | 'vencida' | 'programada';

export interface PromotionStatusInput {
  // Fechas de Colombia (AAAA-MM-DD), las dos incluidas.
  validFrom: string;
  validUntil: string;
  now: Date;
  // La vigencia del precio oficial de esa presentación en esa tienda (ADR-005).
  officialFreshness: Freshness;
}

export function promotionStatus({
  validFrom,
  validUntil,
  now,
  officialFreshness,
}: PromotionStatusInput): PromotionStatus {
  // Las fechas AAAA-MM-DD se comparan bien como texto.
  const today = colombiaDate(now);
  if (today > validUntil) return 'vencida';
  if (today < validFrom) return 'programada';
  return officialFreshness === 'vigente' ? 'activa' : 'pausada';
}

// D6: los tres tipos de promoción.
export type PromotionOffer =
  | { type: 'descuento_porcentual'; percent: number }
  | { type: 'precio_especial'; specialPriceCop: number }
  // Paga X unidades y lleva Y.
  | { type: 'pague_x_lleve_y'; payX: number; takeY: number };

// El precio de una unidad con la promoción, en pesos enteros, a partir del oficial vigente.
export function promotedPriceCop(offer: PromotionOffer, officialPriceCop: number): number {
  switch (offer.type) {
    case 'descuento_porcentual':
      return Math.round((officialPriceCop * (100 - offer.percent)) / 100);
    case 'precio_especial':
      return offer.specialPriceCop;
    case 'pague_x_lleve_y':
      return Math.round((officialPriceCop * offer.payX) / offer.takeY);
  }
}

// Regla incumplida (422) con código estable.
export class InvalidPromotionError extends DomainError {
  readonly code = 'INVALID_PROMOTION';
}

const isIntegerIn = (value: number, min: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

// D6 y EC-06: el «antes» es el oficial vigente, así que la promoción siempre baja el precio.
export function assertValidOffer(offer: PromotionOffer, officialPriceCop: number): void {
  switch (offer.type) {
    case 'descuento_porcentual':
      if (!isIntegerIn(offer.percent, 1, 90)) {
        throw new InvalidPromotionError('El descuento debe ser un número entero de 1 a 90 %.');
      }
      return;
    case 'precio_especial':
      if (
        !isIntegerIn(offer.specialPriceCop, PLAUSIBILITY_PARAMS.minPriceCop, officialPriceCop - 1)
      ) {
        throw new InvalidPromotionError(
          'El precio especial debe ser menor que tu precio oficial y de al menos $100.',
        );
      }
      return;
    case 'pague_x_lleve_y':
      if (!isIntegerIn(offer.payX, 1) || !isIntegerIn(offer.takeY, offer.payX + 1)) {
        throw new InvalidPromotionError(
          'En «pague X lleve Y», Y debe ser mayor que X y X al menos 1.',
        );
      }
  }
}

// Precisión de D6 (22-nov-2026): una promoción dura como mucho 30 días. Valor PROVISIONAL.
export const MAX_PROMOTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, until: string): number =>
  (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

export function assertValidDates({
  validFrom,
  validUntil,
  now,
}: Pick<PromotionStatusInput, 'validFrom' | 'validUntil' | 'now'>): void {
  if (validUntil < validFrom) {
    throw new InvalidPromotionError('La fecha final no puede ser anterior a la de inicio.');
  }
  if (validUntil < colombiaDate(now)) {
    throw new InvalidPromotionError('La fecha final ya pasó.');
  }
  // Los dos días cuentan: del 22 al 21 del mes siguiente son 30 días.
  if (daysBetween(validFrom, validUntil) + 1 > MAX_PROMOTION_DAYS) {
    throw new InvalidPromotionError(
      `Una promoción dura como mucho ${String(MAX_PROMOTION_DAYS)} días: publica otra para seguir.`,
    );
  }
}
