# Grill — issue #15: `GET /v1/products/{productId}/comparison`

- **Fuentes:**
  - Issue #15 (paso 6 del H2-01, épica #6): disponible sin cuenta; precio total, precio por unidad base, fuente, fecha y estado de confianza; orden declarado y reproducible con desempate determinista, sin atributos comerciales.
  - RF-008, RF-009 y RF-010; EC-02, EC-04, EC-06 y EC-08.
  - ADR-004 (aceptado), ADR-005 (vigencia por TTL, aceptado), ADR-009 (promociones aparte) y ADR-019 (mapa, propuesto).
  - `docs/openapi.yaml`: `/products/{productId}/comparison`, `ComparisonItem` y `Comparison`.
  - Código existente: `src/domain/unit-price.ts` (precio por unidad base y su comparación), `src/domain/freshness.ts` (vigencia), `comparison.price_current` (#14) y `catalog.categories.is_fresh` (TTL de 7 o 14 días).
  - Issues relacionadas: #21 (función de orden neutral, H2-02), #28 (precios por establecimiento, Corte 2), #31 (confiabilidad en `price_current`, Corte 2) y #17 (prueba de extremo a extremo, paso 9).
- **Fecha:** 2026-11-12.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **La #21 es la regla de orden neutral** (H2-02), pero la #15 exige un orden con desempate determinista. ¿Cuál va primero?
2. **Datos de otros módulos:** la comparación necesita la presentación (cantidad y unidad), la categoría (TTL) y la tienda (nombre, tipo, coordenadas y distancia), sin leer tablas de `catalog` ni de `establishments`.
3. **Ubicación:** el contrato exige `lat` y `lng`, con radio de 0,2 a 10 km (la #50 aprobó de 0,5 a 3). Además pide `Cache-Control` y `ETag`, pero con la ubicación en la URL la #50 decidió `no-store` (EC-08).
4. **Confiabilidad antes de la #31:** `reliability` es obligatorio en el contrato y aún no hay score.
5. **Precios desactualizados:** el contrato dice que «no entran al orden». ¿Se ocultan o van al final? ¿Qué hace `onlyCurrent`?
6. **Campos opcionales:** `isCheapest`, `confirmations`, `cheapestPriceCop`, `averagePriceCop` y `promotions`.
7. **Fuente:** hoy solo hay reportes de la comunidad (`comunidad`).
8. **Criterios de orden:** `unit_price`, `distance` y `recent`, y el desempate.
9. **Producto inexistente (404) o sin precios** (200 con la lista vacía).

## Preguntas

### 1. ¿La #21 va antes que la #15?

- **Decisión:** sí. La regla de orden neutral se construye primero, en la issue #21, con su propia rama y su propio pull request. La #15 la usa después.
- **Razón:** una issue, un pull request. La regla es el corazón de EC-06 y merece su propia evidencia TDD para MC-E3. Así el pull request de la #15 no crece.
- **Consecuencia:** la rama `feat/comparison-consultar-producto` queda sin commits hasta que la #21 se mezcle en `dev`; luego se actualiza desde `dev`.
- **Cumplido:** la #21 se mezcló en `dev` el 12 de noviembre (PR #60). La regla es `rankOffers` en `src/domain/neutral-ranking.ts`.

### 2. ¿Cómo obtiene `comparison` los datos de `catalog` y `establishments`?

- **Decisión:** con dos consultas públicas nuevas, exportadas por el `index.ts` de cada módulo:
  1. `catalog`: `ProductForComparison.find(productId)` devuelve el producto con sus presentaciones (cantidad, unidad y empaque) e `isFresh`, o `null` si no existe.
  2. `comparison` lee su propia tabla `price_current` para esas presentaciones.
  3. `establishments`: `EstablishmentsWithinRadius.find({ ids, lat, lng, radiusMeters })` devuelve solo las tiendas de esa lista que están dentro del radio, con nombre, tipo, dirección, coordenadas y distancia (PostGIS, `ST_DWithin`).
  4. Se calcula el precio por unidad y la vigencia, se filtra y se ordena con `rankOffers`.
- **Razón:** respeta los límites del monolito (ningún `join` entre esquemas) y pide exactamente lo que se necesita. Reusar `ListNearbyEstablishments` no sirve: su `limit` deja que tiendas sin precio ocupen cupos y se pierdan resultados sin que se note.
- **Consecuencia:** cuántos días es el TTL (7 o 14, provisionales en ADR-005) se decide en `comparison`, en un solo lugar. Cada consulta nueva lleva su prueba de integración, como `PresentationExists` y `EstablishmentExists` en la #14.

### 3. ¿Qué radio y qué caché usa la comparación?

- **Decisión:** los mismos de `GET /v1/establishments/nearby` (#50): radio de 0,5 a 3 km con 2 por defecto, `Cache-Control: no-store` y sin `ETag`. No hay `limit`.
- **Razón:** con radios distintos, el mapa y la comparación mostrarían tiendas diferentes. La URL lleva la ubicación del usuario, y una caché pública o intermedia la guardaría (EC-08): es la misma excepción a EC-04 aceptada en la #50. Sin `limit`, porque solo llegan tiendas con precio para el producto dentro de 3 km (YAGNI).
- **Consecuencia:** el contrato se corrige en el pull request de la #15. Lleva la misma prueba de privacidad de la #50: la ubicación no aparece en la respuesta ni en el log, y no se guarda ninguna fila.

### 4. ¿Qué pasa con `reliability` antes de la #31?

- **Decisión:** sale de los campos obligatorios de `ComparisonItem` y no se envía hasta la #31. En el contrato queda opcional, con la nota «desde la #31».
- **Razón:** el score todavía no existe y un valor fijo sería un dato inventado. La vigencia ya cubre la parte del estado de confianza que hoy se calcula con datos reales. Un valor temporal como `sin_calificar` agregaría al contrato algo que quizá sobre después. Es el mismo patrón de la #14 con el 401 («desde la #16»).

### 5. ¿Qué pasa con los precios desactualizados y con `onlyCurrent`?

- **Decisión:** `results` lleva primero los precios `vigente` y `por_confirmar`, ordenados juntos con `rankOffers`, y al final los `desactualizado`, ordenados entre sí con el mismo criterio. Un desactualizado nunca es `isCheapest` ni cuenta en los resúmenes de precio. Con `onlyCurrent=true` solo quedan los `vigente`.
- **Razón:** un precio viejo con su etiqueta sigue siendo información útil, sobre todo si no hay precios recientes, e invita a confirmarlo. Al ir al final no le quita el puesto a un precio reciente («no entra al orden», como dice el contrato). Ocultarlo dejaría al usuario sin información y haría sobrar el valor `desactualizado` del contrato.
- **Consecuencia:** la regla de los grupos se construye con TDD en el caso de uso.

### 6. ¿Qué pasa con los campos opcionales?

- **Decisión:**
  - `promotions`: sigue obligatorio y va siempre vacío (`[]`) hasta el corte 3 (ADR-009).
  - `isCheapest`: se envía. Es `true` en el precio más bajo por unidad (valor exacto) entre los vigentes y por confirmar; si varios empatan, en todos.
  - `confirmations`: desde la #31, como `reliability`.
  - `cheapestPriceCop` y `averagePriceCop`: salen del contrato.
- **Razón:** una lista vacía de promociones es la verdad de hoy. `isCheapest` sale del mismo valor exacto que usa el orden y es más útil con los órdenes `distance` y `recent`. Los dos resúmenes son precios totales: promediar 500 g con 1 kg no significa nada, y ninguna pantalla los usa (YAGNI). Si hacen falta, se definen sobre el precio por unidad.

### 7. ¿Qué fuente lleva cada precio?

- **Decisión:** `source` va siempre como `comunidad`, desde una constante del caso de uso. No se agrega columna a `price_current`. El contrato conserva `oficial` y `siembra`.
- **Razón:** hoy `price_current` solo se llena con reportes (`PriceReported`); la semilla de la #51 no carga precios. Una columna que siempre dice lo mismo sobra (YAGNI). Se agrega con su migración cuando llegue la segunda fuente (`commerce` en el corte 3, o precios de referencia SIPSA).

### 8. ¿Qué criterios de orden y qué desempate?

- **Decisión:** ya resueltos en la #21 (`rankOffers`): `unit_price`, `distance` y `recent`, con su cadena de desempate. La capa HTTP pone `unit_price` por defecto, y un valor desconocido responde 400. La descripción del parámetro `sort` en el contrato explica la cadena de desempate (EC-06: orden declarado).
- **Sin pregunta:** no había nada nuevo que decidir.

### 9. ¿Qué responde cuando no hay resultado?

- **Decisión:**

  | Caso | Respuesta |
  |---|---|
  | `productId` que no es UUID | 400 `VALIDATION_ERROR` |
  | Faltan `lat` o `lng`, o están fuera de rango; `radiusKm` fuera de 0,5 a 3; `sort` desconocido | 400 `VALIDATION_ERROR` |
  | El producto no existe | 404 `NOT_FOUND` |
  | El producto existe pero no tiene precios en el radio | 200 con `results: []` y `promotions: []` |
  | El producto mezcla bases de unidad | 422 `INCOMPATIBLE_UNITS` (no debería pasar con la #59) |

- **Razón:** un producto inexistente es un error de quien llama; un producto sin precios cerca es una respuesta válida, y el frontend muestra cosas distintas en cada caso. El 422 ya sale del filtro común porque `IncompatibleUnitsError` es un `DomainError`; se documenta para que no sorprenda.

## Resultado

Nueve decisiones. El contrato está en `contrato-api.md` y el plan en `plan.md`.
