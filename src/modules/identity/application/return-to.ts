const MAX_LENGTH = 512;

// ADR-033, anti open-redirect: la ruta a la que se vuelve después de entrar solo puede ser una ruta de la
// propia aplicación. Se acepta si empieza por «/» y no por «//», sin barra invertida, sin caracteres de
// control (los navegadores borran tabuladores y saltos de línea: «/\t/x.com» sería «//x.com») y sin
// esquema. Lo demás, incluso codificado (%5c, %2f), vuelve a «/».
export function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  // Sin control (incluye \t \n \r), sin espacios ni barra invertida.
  if (/[\u0000- \u007f\]/u.test(raw)) return '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '/';
  }
  if (decoded.startsWith('//') || /[\u0000- \u007f\]/u.test(decoded)) return '/';
  // Un esquema («javascript:», «https:») no cabe tras una barra inicial, pero se descarta por si acaso.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(decoded)) return '/';
  return raw;
}
