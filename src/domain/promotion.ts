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

// Colombia está en UTC-5 todo el año (no cambia de hora).
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
const colombiaDate = (instant: Date): string =>
  new Date(instant.getTime() + COLOMBIA_OFFSET_MS).toISOString().slice(0, 10);

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
