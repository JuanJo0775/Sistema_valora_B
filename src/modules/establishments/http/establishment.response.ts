import type { EstablishmentDetail } from '../application/establishment-repository';

// DTO de salida explícito (regla api-rest): el esquema Establishment sin distanceM, porque sin la
// ubicación del usuario no hay distancia (#116).
export interface EstablishmentDetailResponse {
  id: string;
  name: string;
  type: string;
  address?: string;
  lat: number;
  lng: number;
  municipality: string;
}

export function toEstablishmentDetailResponse(
  store: EstablishmentDetail,
): EstablishmentDetailResponse {
  return {
    id: store.id,
    name: store.name,
    type: store.type,
    ...(store.address === undefined ? {} : { address: store.address }),
    lat: store.lat,
    lng: store.lng,
    municipality: store.municipality,
  };
}
