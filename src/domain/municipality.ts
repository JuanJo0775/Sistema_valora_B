// Grill de la #106, pregunta 1 (RF-009 RN5): los 12 municipios del Quindío. El código no lleva tildes
// ni mayúsculas para usarlo en la URL; el nombre es el que se muestra.
export const MUNICIPALITIES = [
  { code: 'armenia', name: 'Armenia' },
  { code: 'buenavista', name: 'Buenavista' },
  { code: 'calarca', name: 'Calarcá' },
  { code: 'circasia', name: 'Circasia' },
  { code: 'cordoba', name: 'Córdoba' },
  { code: 'filandia', name: 'Filandia' },
  { code: 'genova', name: 'Génova' },
  { code: 'la-tebaida', name: 'La Tebaida' },
  { code: 'montenegro', name: 'Montenegro' },
  { code: 'pijao', name: 'Pijao' },
  { code: 'quimbaya', name: 'Quimbaya' },
  { code: 'salento', name: 'Salento' },
] as const;

export type Municipality = (typeof MUNICIPALITIES)[number]['code'];

export const MUNICIPALITY_CODES: readonly string[] = MUNICIPALITIES.map(({ code }) => code);

export const isMunicipality = (value: string): value is Municipality =>
  MUNICIPALITY_CODES.includes(value);

// H16: centro aproximado de la cabecera de cada municipio. No son límites oficiales: sirven para
// avisar a moderación de una ubicación que parece de otro municipio, nunca para rechazar.
const CENTERS: Record<Municipality, { lat: number; lng: number }> = {
  armenia: { lat: 4.5339, lng: -75.6811 },
  buenavista: { lat: 4.3597, lng: -75.7378 },
  calarca: { lat: 4.5292, lng: -75.6439 },
  circasia: { lat: 4.6184, lng: -75.6358 },
  cordoba: { lat: 4.3925, lng: -75.6853 },
  filandia: { lat: 4.6742, lng: -75.6583 },
  genova: { lat: 4.2064, lng: -75.7881 },
  'la-tebaida': { lat: 4.45, lng: -75.7889 },
  montenegro: { lat: 4.5667, lng: -75.75 },
  pijao: { lat: 4.334, lng: -75.7 },
  quimbaya: { lat: 4.6256, lng: -75.7639 },
  salento: { lat: 4.6375, lng: -75.57 },
};

// Cerca de una frontera el centro más próximo no dice de qué lado cae el punto: hasta esta diferencia
// de distancia no se cuestiona lo que escribió quien propone.
const BORDER_MARGIN_KM = 3;

const EARTH_RADIUS_KM = 6371;

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// El municipio al que parece pertenecer la ubicación, si no es el que se declaró y la diferencia no se
// explica por estar en una frontera. undefined: la ubicación cuadra con lo declarado.
export function suggestedMunicipality(
  declared: Municipality,
  point: { lat: number; lng: number },
): Municipality | undefined {
  const distances = MUNICIPALITIES.map(({ code }) => ({
    code,
    km: kmBetween(point, CENTERS[code]),
  })).sort((a, b) => a.km - b.km);
  const nearest = distances[0];
  const declaredKm = distances.find(({ code }) => code === declared)?.km;
  if (!nearest || declaredKm === undefined || nearest.code === declared) return undefined;
  return declaredKm - nearest.km > BORDER_MARGIN_KM ? nearest.code : undefined;
}
