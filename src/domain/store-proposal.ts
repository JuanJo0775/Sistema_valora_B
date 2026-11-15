// Grill de la #27, pregunta 2: palabras que no distinguen una tienda de otra.
const COMMON_WORDS = new Set([
  'tienda',
  'minimercado',
  'supermercado',
  'mini',
  'market',
  'la',
  'el',
  'los',
  'las',
  'de',
  'del',
  'y',
]);

// Sin tildes, en minúsculas y sin palabras comunes.
const keyWords = (name: string): Set<string> =>
  new Set(
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter((word) => word !== '' && !COMMON_WORDS.has(word)),
  );

// RF-005 RN3: dos nombres son equivalentes si las palabras clave de uno están todas en el otro.
export function equivalentStoreNames(a: string, b: string): boolean {
  const first = keyWords(a);
  const second = keyWords(b);
  if (first.size === 0 || second.size === 0) return false;
  const [smaller, larger] = first.size <= second.size ? [first, second] : [second, first];
  return [...smaller].every((word) => larger.has(word));
}
