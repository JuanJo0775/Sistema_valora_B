import type { Comparison } from '../application/compare-product';

// DTO de salida explícito (regla api-rest): la forma del esquema Comparison de docs/openapi.yaml.
export interface ComparisonItemResponse {
  establishment: {
    id: string;
    name: string;
    type: string;
    address?: string;
    neighborhood?: string;
    lat: number;
    lng: number;
    municipality: string;
    // Grill de la #106: sin la ubicación del usuario no hay distancia.
    distanceM?: number;
  };
  // #204: un precio oficial no viene de un reporte ni se califica.
  reportId?: string;
  presentationId: string;
  priceCop: number;
  unitPrice: { valueCop: number; per: string };
  source: string;
  freshness: string;
  isCheapest: boolean;
  reliability?: string;
  confirmations?: number;
  observedAt: string;
  // D1 (#204): solo con discrepancia corroborada.
  discrepancy?: {
    officialPriceCop: number;
    reportedPriceCop: number;
    reports: number;
    since: string;
  };
}

// D6 (#206): una promoción activa, con la oferta aplanada como en el esquema Promotion.
export interface PromotionResponse {
  id: string;
  establishment: ComparisonItemResponse['establishment'];
  presentationId: string;
  type: string;
  percent?: number;
  specialPriceCop?: number;
  payX?: number;
  takeY?: number;
  conditions: { maxPerCustomer?: number; whileStocksLast: boolean; paymentMethod: string };
  validFrom: string;
  validUntil: string;
  officialPriceCop: number;
  promotedPriceCop: number;
}

export interface ComparisonResponse {
  productId: string;
  criteria: { sort: string; radiusKm?: number; municipality?: string };
  results: ComparisonItemResponse[];
  promotions: PromotionResponse[];
  // Grill de la #34: referencia SIPSA aparte, nunca precio de una tienda.
  wholesaleReference?: {
    source: string;
    productName: string;
    market: string;
    pricePerKgCop: number;
    periodStart: string;
    periodEnd: string;
    url: string;
  };
  // B#128 (EC-06): cuánto menos cuesta el más barato que la tienda más cara.
  savingsPercent?: number;
}

type Establishment = Comparison['results'][number]['establishment'];

const toEstablishment = (
  establishment: Establishment,
): ComparisonItemResponse['establishment'] => ({
  id: establishment.id,
  name: establishment.name,
  type: establishment.type,
  ...(establishment.address === undefined ? {} : { address: establishment.address }),
  ...(establishment.neighborhood === undefined ? {} : { neighborhood: establishment.neighborhood }),
  lat: establishment.lat,
  lng: establishment.lng,
  municipality: establishment.municipality,
  ...(establishment.distanceM === undefined ? {} : { distanceM: establishment.distanceM }),
});

export function toComparisonResponse(comparison: Comparison): ComparisonResponse {
  return {
    productId: comparison.productId,
    criteria: comparison.criteria,
    results: comparison.results.map(({ establishment, unitPrice, ...item }) => ({
      establishment: toEstablishment(establishment),
      // ADR-028: solo un precio de la comunidad trae su reportId y puede marcarse. Un dato inicial
      // (siembra) tampoco: su id no es un reporte y marcarlo responde 404.
      ...(item.reportId === undefined || item.source !== 'comunidad'
        ? {}
        : { reportId: item.reportId }),
      presentationId: item.presentationId,
      priceCop: item.priceCop,
      // Se muestra redondeado; el orden ya usó el valor exacto.
      unitPrice: { valueCop: unitPrice.displayCop, per: unitPrice.per },
      source: item.source,
      freshness: item.freshness,
      isCheapest: item.isCheapest,
      ...(item.reliability === undefined ? {} : { reliability: item.reliability }),
      ...(item.confirmations === undefined ? {} : { confirmations: item.confirmations }),
      observedAt: item.observedAt.toISOString(),
      ...(item.discrepancy === undefined
        ? {}
        : {
            discrepancy: {
              ...item.discrepancy,
              since: item.discrepancy.since.toISOString(),
            },
          }),
    })),
    promotions: comparison.promotions.map(({ establishment, offer, conditions, ...promotion }) => ({
      id: promotion.id,
      establishment: toEstablishment(establishment),
      presentationId: promotion.presentationId,
      ...offer,
      conditions: { ...conditions },
      validFrom: promotion.validFrom,
      validUntil: promotion.validUntil,
      officialPriceCop: promotion.officialPriceCop,
      promotedPriceCop: promotion.promotedPriceCop,
    })),
    ...(comparison.wholesaleReference === undefined
      ? {}
      : { wholesaleReference: { ...comparison.wholesaleReference } }),
    ...(comparison.savingsPercent === undefined
      ? {}
      : { savingsPercent: comparison.savingsPercent }),
  };
}
