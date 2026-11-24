// H11 y ADR-037: una tienda de cadena (D1, Ara, Éxito…) no tiene un dueño que la reclame desde la
// aplicación: sus precios oficiales los define la cadena, no quien está cerca de una sucursal.
// Función pura: no sabe de HTTP ni de la base de datos.

export type StoreType = 'barrio' | 'minimercado' | 'supermercado' | 'descuento';

// Las cadenas colombianas conocidas, declaradas en un solo lugar. Se comparan como palabra completa,
// sin mayúsculas ni tildes: «Panadería D10» no es D1. Para agregar una cadena basta añadirla aquí.
export const CHAIN_NAMES: readonly string[] = [
  'D1',
  'Ara',
  'Éxito',
  'Olímpica',
  'Carulla',
  'Jumbo',
  'Metro',
  'Alkosto',
  'Makro',
  'Justo & Bueno',
  'Justo y Bueno',
  'PriceSmart',
  'Price Smart',
  'Surtimax',
  'Super Inter',
  'Oxxo',
];

// Minúsculas, sin tildes, el «&» como «y» y todo lo que no sea letra o número como un espacio; los
// espacios van a los lados para que «ara» no se encuentre dentro de «aracely».
function normalize(text: string): string {
  const words = text
    .toLowerCase()
    .replaceAll('&', ' y ')
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
  return ` ${words.join(' ')} `;
}

const NORMALIZED_CHAINS = CHAIN_NAMES.map((name) => normalize(name));

// El tipo «descuento» es el de las cadenas de descuento (D1, Ara); además, el nombre puede coincidir
// con una cadena de la lista, sea cual sea el tipo con que quedó registrada la sucursal.
export function isChainStore(name: string, type: StoreType): boolean {
  if (type === 'descuento') return true;
  const normalized = normalize(name);
  return NORMALIZED_CHAINS.some((chain) => normalized.includes(chain));
}

// cadena: no se reclama. revision: queda pre-aprobado hasta que un moderador lo revise.
// inmediata: se verifica por cercanía (barrio y minimercado, D2).
export type ClaimPath = 'cadena' | 'revision' | 'inmediata';

export function claimPathFor(name: string, type: StoreType): ClaimPath {
  if (isChainStore(name, type)) return 'cadena';
  return type === 'supermercado' ? 'revision' : 'inmediata';
}
