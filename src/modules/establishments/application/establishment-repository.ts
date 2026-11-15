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

// Grill de la #28: la tienda de la ruta de precios por tienda.
export type EstablishmentDetail = Omit<NearbyEstablishment, 'distanceM'>;

// Ubicación aproximada del usuario: solo se usa para calcular la cercanía y no se guarda (RF-005 RN5).
export interface NearbyQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
}

// Las tiendas de la lista que están dentro del radio; la ubicación del usuario tampoco se guarda.
export interface WithinRadiusQuery {
  ids: string[];
  lat: number;
  lng: number;
  radiusMeters: number;
}

// Tiendas cerca de otra tienda (la zona de reliability).
export interface AroundQuery {
  establishmentId: string;
  radiusMeters: number;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface EstablishmentRepository {
  findNearby(query: NearbyQuery): Promise<NearbyEstablishment[]>;
  findWithinRadius(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
  findAround(query: AroundQuery): Promise<string[]>;
  namesOf(establishmentIds: string[]): Promise<Map<string, string>>;
  findById(establishmentId: string): Promise<EstablishmentDetail | null>;
  exists(establishmentId: string): Promise<boolean>;
}

export const ESTABLISHMENT_REPOSITORY = Symbol('ESTABLISHMENT_REPOSITORY');
