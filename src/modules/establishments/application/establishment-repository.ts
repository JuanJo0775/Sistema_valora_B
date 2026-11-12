export type EstablishmentType = 'barrio' | 'minimercado' | 'supermercado' | 'descuento';

export interface NearbyEstablishment {
  id: string;
  name: string;
  type: EstablishmentType;
  address?: string;
  // Ubicación de la tienda (pública). Nunca la del usuario (RF-005 RN4).
  lat: number;
  lng: number;
  distanceM: number;
}

// Ubicación aproximada del usuario: solo se usa para calcular la cercanía y no se guarda (RF-005 RN5).
export interface NearbyQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface EstablishmentRepository {
  findNearby(query: NearbyQuery): Promise<NearbyEstablishment[]>;
  exists(establishmentId: string): Promise<boolean>;
}

export const ESTABLISHMENT_REPOSITORY = Symbol('ESTABLISHMENT_REPOSITORY');
