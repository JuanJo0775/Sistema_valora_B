import type { NearbyEstablishment } from '../../establishments';

// DTO de salida explícito (regla api-rest): la forma del esquema EstablishmentWithPrices (B#131).
export interface EstablishmentResponse {
  id: string;
  name: string;
  type: string;
  address?: string;
  lat: number;
  lng: number;
  // Grill de la #106.
  municipality: string;
  distanceM: number;
  priceCount: number;
}

export interface NearbyResponse {
  items: EstablishmentResponse[];
}

export function toNearbyResponse(
  found: NearbyEstablishment[],
  priceCounts: Map<string, number>,
): NearbyResponse {
  return {
    items: found.map((store) => ({
      id: store.id,
      name: store.name,
      type: store.type,
      ...(store.address === undefined ? {} : { address: store.address }),
      lat: store.lat,
      lng: store.lng,
      municipality: store.municipality,
      distanceM: store.distanceM,
      priceCount: priceCounts.get(store.id) ?? 0,
    })),
  };
}
