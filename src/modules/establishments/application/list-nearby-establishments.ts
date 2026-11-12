import type { EstablishmentRepository, NearbyEstablishment } from './establishment-repository';

export interface ListNearbyInput {
  lat: number;
  lng: number;
  radiusKm: number;
  limit: number;
}

// Sin reglas de negocio propias: la distancia la calcula PostGIS en el repositorio.
export class ListNearbyEstablishments {
  constructor(private readonly establishments: EstablishmentRepository) {}

  execute(input: ListNearbyInput): Promise<NearbyEstablishment[]> {
    return this.establishments.findNearby({
      lat: input.lat,
      lng: input.lng,
      radiusMeters: input.radiusKm * 1000,
      limit: input.limit,
    });
  }
}
