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
