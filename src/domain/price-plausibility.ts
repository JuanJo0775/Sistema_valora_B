import { DomainError } from './domain-error';
import { baseOf, type Presentation } from './unit-price';

// ADR-030: valores PROVISIONALES (como los de ADR-005 y ADR-006), en un solo lugar y reemplazables
// al llamar. El frontend usa los mismos para confirmar antes de enviar; deben cambiar juntos.
export const PLAUSIBILITY_PARAMS = {
  // Piso y techo absolutos del precio total, en pesos: fuera de ellos el reporte se rechaza (422).
  minPriceCop: 100,
  maxPriceCop: 5_000_000,
  // Frente a la referencia (otras tiendas o SIPSA): menos de 40 % o más de 250 % es sospechoso.
  lowRatio: 0.4,
  highRatio: 2.5,
  // Tiendas distintas necesarias para que su mediana sirva de referencia.
  minPeerStores: 3,
  // Un minorista por debajo de este tanto de la referencia mayorista del mismo peso es sospechoso.
  wholesaleMinRatio: 0.5,
};

export type PlausibilityParams = typeof PLAUSIBILITY_PARAMS;

// Regla incumplida (422) con código estable; la capa HTTP la traduce sin conocer su texto.
export class ImplausiblePriceError extends DomainError {
  readonly code = 'IMPLAUSIBLE_PRICE';
}

const money = new Intl.NumberFormat('es-CO');

export function assertPlausiblePrice(
  priceCop: number,
  params: PlausibilityParams = PLAUSIBILITY_PARAMS,
): void {
  if (priceCop < params.minPriceCop) {
    throw new ImplausiblePriceError(
      `El precio parece incompleto: ningún producto cuesta menos de $${money.format(params.minPriceCop)}. Revisa si faltan ceros.`,
    );
  }
  if (priceCop > params.maxPriceCop) {
    throw new ImplausiblePriceError(
      `El precio parece demasiado alto: ningún producto cuesta más de $${money.format(params.maxPriceCop)}. Revisa si sobran ceros.`,
    );
  }
}

// Con un número par de valores, el promedio de los dos del medio. Se llama con al menos uno.
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

// El precio total que tendría la presentación al precio mayorista por kilo de SIPSA. null si la
// presentación no es de peso (RF-014 RN2: SIPSA solo se compara con productos de peso).
export function wholesaleTotalCop(
  pricePerKgCop: number,
  presentation: Presentation,
): number | null {
  if (baseOf(presentation.unit) !== '100g') return null;
  const grams = presentation.unit === 'kg' ? presentation.quantity * 1000 : presentation.quantity;
  const kilos = (grams * (presentation.packCount ?? 1)) / 1000;
  return Math.round(pricePerKgCop * kilos);
}

// Lo que se sabe de otras fuentes cuando la tienda no tiene cuentas suficientes (arranque en frío).
export interface FallbackReference {
  // Precio vigente de esa presentación en otras tiendas del municipio, uno por tienda.
  peerPricesCop: number[];
  // Precio mayorista SIPSA de la presentación completa, si existe y es reciente.
  wholesaleTotalCop?: number | null;
}

export type FallbackResult =
  | {
      status: 'normal';
      reference: 'tiendas' | 'sipsa';
      median: number;
      deviation: number;
      references: number;
    }
  | {
      status: 'sospechoso';
      reason: 'rango';
      reference: 'tiendas' | 'sipsa';
      median: number;
      deviation: number;
      references: number;
    };

// ADR-030: referencia de arranque en frío, en orden: la mediana de otras tiendas del municipio
// (al menos minPeerStores) y, si no alcanzan, el mayorista SIPSA. null si no hay ninguna. «Menos de»
// y «más de»: el límite exacto es normal.
export function assessAgainstFallback(
  priceCop: number,
  fallback: FallbackReference,
  params: PlausibilityParams = PLAUSIBILITY_PARAMS,
): FallbackResult | null {
  const { peerPricesCop, wholesaleTotalCop: wholesale } = fallback;
  if (peerPricesCop.length >= params.minPeerStores) {
    const usual = median(peerPricesCop);
    const ratio = priceCop / usual;
    const base = {
      reference: 'tiendas' as const,
      median: usual,
      deviation: Math.abs(priceCop - usual) / usual,
      references: peerPricesCop.length,
    };
    return ratio < params.lowRatio || ratio > params.highRatio
      ? { status: 'sospechoso', reason: 'rango', ...base }
      : { status: 'normal', ...base };
  }
  if (wholesale !== null && wholesale !== undefined && wholesale > 0) {
    const base = {
      reference: 'sipsa' as const,
      median: wholesale,
      deviation: Math.abs(priceCop - wholesale) / wholesale,
      references: 1,
    };
    return priceCop / wholesale < params.wholesaleMinRatio
      ? { status: 'sospechoso', reason: 'rango', ...base }
      : { status: 'normal', ...base };
  }
  return null;
}
