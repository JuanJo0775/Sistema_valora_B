import type { Municipality } from '../../../domain/municipality';

export type EstablishmentType = 'barrio' | 'minimercado' | 'supermercado' | 'descuento';

export interface NearbyEstablishment {
  id: string;
  name: string;
  type: EstablishmentType;
  address?: string;
  // H-06: barrio de la tienda, cuando el directorio lo tiene; dato público de la tienda (EC-08).
  neighborhood?: string;
  // Ubicación de la tienda (pública). Nunca la del usuario (RF-005 RN4).
  lat: number;
  lng: number;
  // Grill de la #106: municipio del Quindío.
  municipality: Municipality;
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
  // Grill de la #106: además del radio, solo las de un municipio.
  municipality?: Municipality;
}

// Grill de la #106: las tiendas de la lista que están en un municipio, sin la ubicación del usuario.
export interface InMunicipalityQuery {
  ids: string[];
  municipality: Municipality;
}

// #116: tiendas cuyo nombre contiene cada palabra de q y que están en el municipio, sin la
// ubicación del usuario.
export interface SearchQuery {
  q?: string;
  municipality?: Municipality;
  limit: number;
}

// Tiendas cerca de otra tienda (la zona de reliability).
export interface AroundQuery {
  establishmentId: string;
  radiusMeters: number;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface EstablishmentRepository {
  findNearby(query: NearbyQuery): Promise<NearbyEstablishment[]>;
  search(query: SearchQuery): Promise<EstablishmentDetail[]>;
  findWithinRadius(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
  findInMunicipality(query: InMunicipalityQuery): Promise<EstablishmentDetail[]>;
  findAround(query: AroundQuery): Promise<string[]>;
  namesOf(establishmentIds: string[]): Promise<Map<string, string>>;
  findById(establishmentId: string): Promise<EstablishmentDetail | null>;
  // Grill de la #27: las tiendas a menos de `meters` de un punto, para sugerir duplicados.
  findWithinMeters(
    point: { lat: number; lng: number },
    meters: number,
  ): Promise<{ id: string; name: string; distanceM: number }[]>;
  exists(establishmentId: string): Promise<boolean>;
  // H36 (ADR-040): las tiendas retiradas.
  retiredIds(): Promise<string[]>;
}

export const ESTABLISHMENT_REPOSITORY = Symbol('ESTABLISHMENT_REPOSITORY');
