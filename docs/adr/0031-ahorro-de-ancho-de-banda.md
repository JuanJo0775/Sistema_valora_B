# ADR-031: Ahorro de ancho de banda: compresión, caché pública corta y guardas de la prueba de carga

- **Estado:** Propuesto
- **Fecha:** 2026-11-18
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-04 (rendimiento), EC-08 (privacidad)
- **Requisitos relacionados:** RNF-004, RNF-011; ADR-012 (despliegue en Render, Neon y Vercel)

## Contexto

El 17 de noviembre de 2026 Render suspendió la API porque el servicio gratuito pasó del límite de **5 GB de ancho de banda de salida al mes (11 GB)**. Causas:

1. **La prueba de carga k6** (`test/load`, workflow `load.yml`: 500 usuarios, 10 minutos) apuntaba por defecto a producción. Cada corrida mueve unos 3 GB sin comprimir.
2. **La API no comprimía** sus respuestas JSON.
3. **Todo el tráfico de la PWA pasa por Vercel** (reescritura de `/v1/*` hacia Render) y las respuestas no declaraban caché compartida (`s-maxage`), así que Vercel no las guardaba y cada consulta llegaba a Render.

La API se migró a otra cuenta de Render. Este ADR cubre lo que se cambia en el repositorio para que no vuelva a pasar.

## Decisión

1. **Compresión.** `configureApp` activa el middleware `compression` (gzip o brotli según `Accept-Encoding`) con umbral de 1 kB. Solo comprime tipos de texto, así que las fotos de `/media/` y lo ya comprimido pasan intactos; agrega `Vary: Accept-Encoding`. Dependencia nueva: `compression`, el middleware estándar de Express para esto (evita reimplementar la negociación de codificación).
2. **Caché pública corta** (`src/shared/http/cache-control.ts`), con `s-maxage` para la caché de Vercel y `stale-while-revalidate`:
   - Categorías: 1 h. Producto por id y tiendas por texto o municipio: 5 min.
   - Búsqueda de productos: 30 s en el navegador, 60 s en la caché compartida.
   - **Todo lo que lleva precios** (comparación por municipio, precios de una tienda, productos destacados sin ubicación, historial): **`s-maxage` de 60 s como máximo**.
   - **`no-store`:** cualquier ruta con `lat` o `lng` (comparación, destacados, tiendas cercanas), `GET /auth/session` (lleva el token CSRF), mis reportes, moderación, solicitudes de producto, propuestas de tiendas, `health` y **todo error** (el filtro de errores lo fuerza, aunque la ruta ya hubiera puesto una cabecera pública).
   - Se mantiene el ETag de Express: con `If-None-Match` la respuesta es 304 sin cuerpo.
   - La comparación solo con municipio pasa de `no-store` a caché pública de 60 s: no lleva dato personal (el municipio es un filtro, no la ubicación del usuario).
3. **Guardas de la prueba de carga.** `load.yml` ya no apunta a producción por defecto (`http://localhost:3000/v1`); si la URL contiene `onrender.com` o `vercel.app`, el primer paso falla salvo que `confirmar_produccion` valga exactamente `CARGA-EN-PRODUCCION`. Valores por defecto de 50 usuarios y 2 minutos, y el encabezado explica el costo en ancho de banda y el límite de 5 GB. Se retira la variable de repositorio `LOAD_API_URL`. Ver `docs/calidad/prueba-de-carga-ec04.md`.
4. **Health liviano.** `GET /v1/health` no toca la base de datos (#25), responde 15 bytes y ahora lleva `no-store`. No se cambia su frecuencia: la define Render (`healthCheckPath` en `render.yaml`).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Pagar el plan de Render con tarjeta | Resuelve el límite sin tocar código | Costo recurrente; el proyecto es académico y se decidió usar planes gratuitos (ADR-012) |
| B. Otro hosting con más ancho de banda gratuito | Más margen | Migrar otra vez; riesgo de otro límite distinto; no corrige la causa (respuestas sin comprimir y sin caché) |
| C. CDN propio (Cloudflare u otro) delante de Render | Caché más flexible | Un servicio más que operar; Vercel ya hace de CDN y solo necesitaba las cabeceras |
| D. Solo compresión | Simple | No evita que cada consulta repetida llegue a Render |
| E. Solo apagar la prueba de carga | Quita la causa más grande | Deja la API vulnerable al tráfico real cuando crezca |

Se eligió combinar compresión, caché corta y guardas: no tiene costo y ataca las tres causas.

## Medición

Prueba `test/integration/http-bandwidth.spec.ts`, con una comparación de 40 tiendas por municipio:

| Codificación | Bytes | Ahorro |
|---|---|---|
| Sin comprimir | 21.243 | |
| gzip | 2.953 | 86 % |
| brotli | 2.621 | 88 % |

Una respuesta de menos de 1 kB (por ejemplo `/v1/categories`) no se comprime. Con la caché de Vercel, además, las consultas repetidas del mismo producto y municipio dentro de 60 s no llegan a Render. Con la compresión sola, una carga de 500 usuarios y 10 minutos baja de unos 3 GB a menos de 0,5 GB; con aciertos de caché, a mucho menos.

## Consecuencias y riesgos

- **Precios obsoletos hasta 60 s** en Vercel (más hasta 30 s de `stale-while-revalidate` mientras se renueva) y 30 s en el navegador. Quien reporta un precio puede no verlo en la comparación durante ese lapso. Si molesta, se baja `CACHE_PRICES` en un solo lugar (`cache-control.ts`).
- **Caché compartida:** una respuesta pública la ven todos. Por eso solo se aplica a rutas sin sesión, cookies ni ubicación, y hay pruebas que verifican `no-store` en las privadas. Una ruta nueva debe declarar su caché a propósito.
- **`Vary`:** la compresión agrega `Vary: Accept-Encoding`; el CDN guarda una copia por codificación.
- **CPU:** comprimir gasta algo de CPU en el plan gratuito; el umbral de 1 kB y el nivel por defecto del middleware lo mantienen bajo.
- Una prueba de carga contra Vercel mide la caché, no la API (ver `docs/calidad/prueba-de-carga-ec04.md`).

## Cómo medir

Panel de Render, **Metrics**, gráfica de ancho de banda de salida, antes y después del despliegue, comparando días de tráfico parecido. En Vercel, el uso y los registros muestran los aciertos de caché de `/v1/*`. En una petición suelta, `curl -sI -H "Accept-Encoding: gzip" <url>` debe mostrar `Content-Encoding: gzip` y, detrás de Vercel, la cabecera `x-vercel-cache`.

## Decisiones que quedan para el equipo

- Aceptar los 60 s de `s-maxage` para precios (o bajarlos a 30 s).
- Si el tráfico real sigue alto, evaluar el plan de pago (alternativa A) o más caché.
