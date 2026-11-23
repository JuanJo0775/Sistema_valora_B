# ADR-035: Plan de compra: consultar por municipio y calcular la cercanía en el dispositivo

- **Estado:** Aceptado (22-nov-2026), por decisión del dueño del proyecto
- **Fecha:** 2026-11-22
- **Responsables:** pendiente de asignar. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-04 (rendimiento), EC-08 (privacidad)
- **Requisitos relacionados:** RF-009 (comparación); RNF-004, RNF-011; ADR-031 (ancho de banda), ADR-034 (plan de compra), ADR-019, ADR-010
- **Registro oficial:** base ADRs de Notion. Implementado y verificado en el PR F#178 (en `dev`).
- **Numeración:** se renumeró el 22-nov-2026 (antes 033): el 032 y el 033 ya los usa el backend.

## Contexto

El 17-nov-2026 Render suspendió la API por superar el límite gratuito de **5 GB de ancho de banda de salida al mes** (ADR-031). La respuesta fue comprimir (gzip o brotli, 86 a 88 % menos) y poner caché pública corta delante de la API. Verificado en el código (`src/shared/http/cache-control.ts` y `comparison.controller.ts`):

| Tipo de consulta | `Cache-Control` | Quién la guarda |
|---|---|---|
| Comparación solo con municipio | `public, max-age=30, s-maxage=60, stale-while-revalidate=30` + ETag | Navegador (30 s) y CDN de Vercel, compartida por todos (60 s) |
| Comparación con `lat` o `lng` | `no-store` | Nadie, a propósito (privacidad) |

Vercel reescribe `/v1/*` hacia Render (`vercel.json`), así que todo el tráfico pasa por su CDN.

El plan de compra (ADR-034) consultaba la comparación **con ubicación y radio**: una URL distinta por persona y por radio (no se puede compartir ni guardar), una consulta por producto cada vez que cambia el radio, y la ubicación viajando al servidor. Y la recomendación «la más barata de todo el municipio» habría exigido una segunda ronda de consultas por producto.

Dato comprobado: la comparación de un producto **no tiene tope de resultados ni paginación** (el `limit = 5` de `comparison.query.ts` es del DTO de productos destacados), así que una consulta por municipio trae todas las ofertas vigentes de ese producto.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| **A. Consultar por municipio (URL idéntica) y calcular distancia y radio en el dispositivo** | Caché compartida entre todas las personas; cambiar el radio no cuesta red; la ubicación no sale del teléfono (EC-08); sin cambios de backend ni contrato; todas las recomendaciones salen de una sola respuesta | La respuesta trae todo el municipio; distancia en línea recta; requiere disciplina de URL |
| B. Seguir con `lat`, `lng` y `radiusKm` por producto | Ya existe; el servidor filtra | `no-store`: nada se comparte; N solicitudes por cada cambio de radio; la ubicación llega al servidor; segunda ronda para el municipio |
| C. Endpoint por lote con ubicación (`POST /basket/compare`) | Un solo viaje | `no-store`; la ubicación llega al servidor; cómputo en Render; contrato y pruebas nuevos; entra en la medición EC-04 |
| D. Endpoint por lote solo por municipio (`GET /comparison?productIds=`) | Menos viajes | La URL depende de la combinación de productos: se pierde el acierto de caché compartida; HTTP/2 ya multiplexa las consultas pequeñas |
| E. Calcular el reparto en el servidor | Una sola respuesta | Toca el núcleo, más carga en Render, necesita la ubicación, no se puede cachear |
| F. Redondear la ubicación a celdas para cachear consultas con ubicación | Cachea algo | Sigue enviando una ubicación aproximada al servidor y a la CDN; resultados inexactos en los bordes; más complejidad |
| G. Caché local persistente (IndexedDB) de las ofertas | Ahorra más red | Contradice ADR-010; precios viejos como si fueran de hoy |

## Decisión

Se elige **A**.

1. El plan (panel «Dónde comprar» de la canasta, la página del plan y «Actualizar precios») pide `GET /v1/products/{id}/comparison` **siempre con la misma forma de URL**: `municipality`, `sort=unit_price`, `onlyCurrent=true`, la misma que usan el Inicio y la canasta. **Una consulta por producto**; nunca `lat`, `lng` ni `radiusKm`.
2. **La cercanía se calcula en el dispositivo:** la respuesta ya trae las coordenadas de cada tienda; con la ubicación en memoria se calcula la distancia (Haversine) sobre una copia de las ofertas y se filtra por el radio de 0,5 a 3 km.
3. **Cambiar el radio, de recomendación o de pantalla no hace solicitudes nuevas.**
4. **De la misma respuesta salen** la mejor opción cercana, la más cercana y la más barata de todo el municipio.
5. La ubicación **no sale del dispositivo** para esta función.
6. **Una consulta por producto y no por lote**, para que cada URL se comparta entre personas y canastas distintas.

## Consecuencias

**Positivas**

- Las consultas se reparten entre todas las personas del municipio: el primer pedido de cada producto llega a Render y los demás, dentro de la ventana de caché, los sirve la CDN o el navegador. Es lo que pide el ADR-031 para no volver a agotar el ancho de banda.
- Cambiar el radio o de recomendación es instantáneo y no gasta red.
- EC-08 mejora: se elimina el único uso de la ubicación en la red para esta función.
- Sin cambios de backend ni de contrato OpenAPI; reversible.

**Negativas y riesgos**

- **La respuesta trae todo el municipio.** Referencia medida en el ADR-031: 21.243 B sin comprimir y 2.621 B con brotli para 40 tiendas (unos 530 B por oferta). Con las 158 tiendas verificadas de la semilla en Armenia, el peor caso es del orden de 80 KB sin comprimir (unos 10 KB comprimidos) por producto; una canasta de 20 productos serían unos 200 KB comprimidos si nada estuviera en caché. Es aceptable y se comparte.
- **Distancia en línea recta**, no por calles: se dice «≈» y se estima el rodeo.
- **Antigüedad de precios** de hasta unos 90 s (30 s del navegador, 60 s de la CDN, más 30 s de revalidación), ya aceptada en el ADR-031.
- **Municipio elegido frente a ubicación real:** si la persona está en otro municipio que el elegido, ve las tiendas del elegido; la pantalla lo avisa.
- **Fragilidad de la caché:** depende de que todas las pantallas pidan exactamente la misma URL. Una prueba lo vigila.
- **Cómputo en el dispositivo:** el reparto exacto con 3 tiendas llega a unas 9.880 combinaciones con 40 candidatas; no está medido en un teléfono de gama baja.

## Verificación

- E2E que cuenta solicitudes: con N productos, exactamente N a `/comparison`, todas con la misma query, **ninguna con `lat` ni `lng`** (también tras «Cerca de mí») y **cero nuevas** al cambiar de recomendación, mover el radio o cambiar de pantalla. La CI compila con `NODE_ENV=development` (React monta dos veces con `StrictMode`), así que la prueba espera N solicitudes en producción y 2N en esa compilación; lo que vigila es que no haya ninguna más.
- Prueba unitaria de `useStoreTotals` con la misma garantía, y del motor de recomendaciones contra una búsqueda exhaustiva.
- Pendiente: medir el tamaño real de la respuesta por municipio con la semilla ampliada y el tiempo del reparto con 3 tiendas en un teléfono de gama baja.

## Cuándo revisarla (disparadores propuestos, no medidos)

- Si la respuesta comprimida de un producto supera unos 30 KB o aparecen más de unas 150 ofertas por producto: estudiar un filtro por radio cacheable por celdas (alternativa F) o un endpoint paginado por municipio.
- Si el reparto con 3 tiendas tarda más de unos 300 ms en un teléfono de gama baja: acotar candidatas o mover el cálculo a un Web Worker.
