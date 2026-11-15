import type { Comparison } from '../application/compare-product';

// DTO de salida explícito (regla api-rest): la forma del esquema Comparison de docs/openapi.yaml.
export interface ComparisonItemResponse {
  establishment: {
    id: string;
    name: string;
    type: string;
    address?: string;
    lat: number;
    lng: number;
    distanceM: number;
  };
  reportId: string;
  presentationId: string;
  priceCop: number;
  unitPrice: { valueCop: number; per: string };
  source: string;
  freshness: string;
  isCheapest: boolean;
  reliability: string;
  confirmations: number;
  observedAt: string;
}

export interface ComparisonResponse {
  productId: string;
  criteria: { sort: string; radiusKm: number };
  results: ComparisonItemResponse[];
  promotions: [];
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
}

export function toComparisonResponse(comparison: Comparison): ComparisonResponse {
  return {
    productId: comparison.productId,
    criteria: comparison.criteria,
    results: comparison.results.map(({ establishment, unitPrice, ...item }) => ({
      establishment: {
        id: establishment.id,
        name: establishment.name,
        type: establishment.type,
        ...(establishment.address === undefined ? {} : { address: establishment.address }),
        lat: establishment.lat,
        lng: establishment.lng,
        distanceM: establishment.distanceM,
      },
      reportId: item.reportId,
      presentationId: item.presentationId,
      priceCop: item.priceCop,
      // Se muestra redondeado; el orden ya usó el valor exacto.
      unitPrice: { valueCop: unitPrice.displayCop, per: unitPrice.per },
      source: item.source,
      freshness: item.freshness,
      isCheapest: item.isCheapest,
      reliability: item.reliability,
      confirmations: item.confirmations,
      observedAt: item.observedAt.toISOString(),
    })),
    promotions: [],
    ...(comparison.wholesaleReference === undefined
      ? {}
      : { wholesaleReference: { ...comparison.wholesaleReference } }),
  };
}
