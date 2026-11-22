import { colombiaDate } from './colombia-date';
import type { Freshness } from './freshness';

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
