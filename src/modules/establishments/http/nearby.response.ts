import type { NearbyEstablishment } from '../application/establishment-repository';

// DTO de salida explícito (regla api-rest): la forma del esquema Establishment de docs/openapi.yaml.
export interface EstablishmentResponse {
  id: string;
  name: string;
  type: string;
  address?: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface NearbyResponse {
  items: EstablishmentResponse[];
}

export function toNearbyResponse(found: NearbyEstablishment[]): NearbyResponse {
  return {
    items: found.map((store) => ({
      id: store.id,
      name: store.name,
      type: store.type,
      ...(store.address === undefined ? {} : { address: store.address }),
      lat: store.lat,
      lng: store.lng,
      distanceM: store.distanceM,
    })),
  };
}
