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

// ADR-037: un precio oficial claramente fuera del rango de referencia se rechaza (422) con su propio
// código estable; la capa HTTP lo traduce sin conocer su texto.
export class ImplausibleOfficialPriceError extends DomainError {
  readonly code = 'IMPLAUSIBLE_OFFICIAL_PRICE';
}

// ADR-037: lo que se concluye al comparar un precio del comercio con la referencia del ADR-030.
// «sin_referencia» no es un rechazo: el precio se acepta, pero queda en revisión.
export type OfficialPriceVerdict =
  { status: 'dentro_de_rango' } | { status: 'sin_referencia' } | OutOfRangeVerdict;

export interface OutOfRangeVerdict {
  status: 'fuera_de_rango';
  reference: 'tiendas' | 'sipsa';
  // Con la referencia de tiendas, el precio más bajo y el más alto que se ven.
  lowestCop: number;
  highestCop: number | null;
  // Con la referencia SIPSA, el precio mayorista de la presentación completa.
  wholesaleCop: number | null;
}

function outOfRange(fallback: FallbackReference, found: FallbackResult): OutOfRangeVerdict {
  if (found.reference === 'tiendas') {
    return {
      status: 'fuera_de_rango',
      reference: 'tiendas',
      lowestCop: Math.min(...fallback.peerPricesCop),
      highestCop: Math.max(...fallback.peerPricesCop),
      wholesaleCop: null,
    };
  }
  return {
    status: 'fuera_de_rango',
    reference: 'sipsa',
    lowestCop: found.median,
    highestCop: null,
    wholesaleCop: found.median,
  };
}

// ADR-037: el precio oficial se compara con la misma referencia y los mismos parámetros que un
// reporte de la comunidad (ADR-030): la mediana de al menos minPeerStores tiendas del municipio o,
// si no alcanzan, el mayorista SIPSA. Sin ninguna de las dos, sin_referencia.
export function assessOfficialPrice(
  priceCop: number,
  fallback: FallbackReference,
  params: PlausibilityParams = PLAUSIBILITY_PARAMS,
): OfficialPriceVerdict {
  const found = assessAgainstFallback(priceCop, fallback, params);
  if (found === null) return { status: 'sin_referencia' };
  if (found.status === 'normal') return { status: 'dentro_de_rango' };
  return outOfRange(fallback, found);
}

// ADR-037: el precio que deja una promoción solo se vigila por el lado bajo, porque una promoción
// siempre baja un precio oficial que ya pasó su propia evaluación.
export function assessPromotionPrice(
  promotedCop: number,
  fallback: FallbackReference,
  params: PlausibilityParams = PLAUSIBILITY_PARAMS,
): OfficialPriceVerdict {
  const found = assessAgainstFallback(promotedCop, fallback, params);
  if (found === null) return { status: 'sin_referencia' };
  if (found.status === 'normal' || promotedCop >= found.median) {
    return { status: 'dentro_de_rango' };
  }
  return outOfRange(fallback, found);
}

// Lanza el 422 de un precio oficial fuera de rango, con el rango de referencia en el mensaje;
// devuelve lo que se debe hacer con los demás.
export function assertOfficialPriceInRange(
  priceCop: number,
  verdict: OfficialPriceVerdict,
): 'dentro_de_rango' | 'sin_referencia' {
  if (verdict.status !== 'fuera_de_rango') return verdict.status;
  const own = `$${money.format(priceCop)}`;
  throw new ImplausibleOfficialPriceError(
    verdict.reference === 'sipsa'
      ? `Tu precio de ${own} es mucho menor que el precio mayorista de referencia para esta presentación ($${money.format(verdict.wholesaleCop ?? 0)}). Revisa si faltan ceros.`
      : `Tu precio de ${own} está fuera de lo normal para esta presentación. Lo más barato que vemos es $${money.format(verdict.lowestCop)} y lo más caro $${money.format(verdict.highestCop ?? verdict.lowestCop)}. Revisa si faltan o sobran ceros.`,
  );
}

// Lo mismo para el precio que dejaría una promoción: el 422 dice cómo corregirla.
export function assertPromotionPriceInRange(
  promotedCop: number,
  verdict: OfficialPriceVerdict,
): void {
  if (verdict.status !== 'fuera_de_rango') return;
  const reference =
    verdict.reference === 'sipsa'
      ? `el precio mayorista de referencia es $${money.format(verdict.wholesaleCop ?? 0)}`
      : `lo más barato que vemos es $${money.format(verdict.lowestCop)} y lo más caro $${money.format(verdict.highestCop ?? verdict.lowestCop)}`;
  throw new ImplausibleOfficialPriceError(
    `Con esta promoción el precio quedaría en $${money.format(promotedCop)}, muy por debajo de lo normal para esta presentación: ${reference}. Sube el precio especial o baja el descuento.`,
  );
}
