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

export function promotionStatus(_input: PromotionStatusInput): PromotionStatus {
  return 'activa';
}
