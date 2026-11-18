// ADR-031: valores de Cache-Control de la API. `max-age` es para el navegador y `s-maxage` para las
// cachés compartidas (el CDN de Vercel delante de Render); `stale-while-revalidate` deja servir la
// copia vencida mientras se pide una nueva, así Render recibe como mucho una petición por ventana.
// Los precios nunca pasan de 60 s en caché compartida. Nada con sesión, cookies ni ubicación del
// usuario (lat/lng) usa estos valores: esas rutas responden `no-store` (EC-08).

export const NO_STORE = 'no-store';

// Catálogo casi estático (categorías).
export const CACHE_STATIC = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

// Datos de catálogo y directorio que cambian poco (producto por id, tiendas por texto o municipio).
export const CACHE_CATALOG = 'public, max-age=300, s-maxage=300, stale-while-revalidate=600';

// Búsqueda de productos: el texto cambia mucho, el contenido poco.
export const CACHE_SEARCH = 'public, max-age=30, s-maxage=60, stale-while-revalidate=60';

// Cualquier respuesta que lleve precios: máximo 60 s en las cachés compartidas (ADR-031).
export const CACHE_PRICES = 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';

// Historial de precios: el navegador conserva 5 minutos, la caché compartida solo 60 s.
export const CACHE_PRICE_HISTORY = 'public, max-age=300, s-maxage=60, stale-while-revalidate=60';
