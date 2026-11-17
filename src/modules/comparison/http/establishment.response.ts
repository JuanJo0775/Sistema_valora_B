import type { EstablishmentDetail } from '../../establishments';

// DTO de salida explícito (regla api-rest): el esquema EstablishmentWithPrices sin distanceM,
// porque sin la ubicación del usuario no hay distancia (#116). B#131: con priceCount.
export interface EstablishmentDetailResponse {
  id: string;
  name: string;
  type: string;
  address?: string;
  lat: number;
  lng: number;
  municipality: string;
  priceCount: number;
}

export function toEstablishmentDetailResponse(
  store: EstablishmentDetail,
  priceCount: number,
): EstablishmentDetailResponse {
  return {
    id: store.id,
    name: store.name,
    type: store.type,
    ...(store.address === undefined ? {} : { address: store.address }),
    lat: store.lat,
    lng: store.lng,
    municipality: store.municipality,
    priceCount,
  };
}
