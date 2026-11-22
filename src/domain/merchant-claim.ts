type Point = { lat: number; lng: number };

// D2 del grill comercial: quien registra un comercio debe estar a 50 m o menos de la tienda.
export const PRESENCE_RADIUS_METERS = 50;

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Distancia sobre la esfera (fórmula del haversine). A 50 m la diferencia con PostGIS es despreciable.
function distanceMeters(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

// La ubicación de la persona solo se usa aquí, para esta comparación: nunca se guarda (EC-08).
export function isAtEstablishment(person: Point, establishment: Point): boolean {
  return distanceMeters(person, establishment) <= PRESENCE_RADIUS_METERS;
}
