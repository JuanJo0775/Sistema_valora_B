# Grill — issue #28: precios vigentes de un establecimiento

- **Fuentes:**
  - Issue #28 (Corte 2, épica #6): ruta que lista los precios vigentes de un establecimiento, leídos de `price_current`; pública, sin cuenta; cada precio con fuente, fecha, vigencia y confianza; documentada en `docs/openapi.yaml`.
  - RF-008 (Notion), EC-02, EC-04.
  - Código existente: `comparison.price_current` (precio por presentación y tienda, con `en_revision`), `CompareProduct` y su `ComparisonItem` (#15, #31, #32), `ReliabilityOfPrices` (#31), vigencia por TTL de la categoría (#18), lecturas públicas con caché y ETag en `GET /v1/products/{productId}` (#49).
- **Fecha:** 2026-11-15.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué ruta y qué trae?

- **Decisión:** `GET /v1/establishments/{establishmentId}/prices`, pública, en el módulo `comparison` (lee `price_current`), aunque cuelgue de `/establishments`. Trae la tienda (nombre, tipo, dirección y lat/lng para el mapa) y, por cada precio: producto y presentación, `productId`, `presentationId`, `reportId` (para marcarlo), precio, precio por unidad, fuente, vigencia, confiabilidad, confirmaciones y fecha de observación. Es la misma forma de cada resultado de la comparación, sin la distancia. `catalog` y `establishments` exponen dos consultas públicas nuevas (las presentaciones por id y el detalle de la tienda).
- **Razón:** el frontend reutiliza la misma tarjeta de precio de la comparación.

### 2. ¿Qué precios entran y en qué orden?

- **Decisión:** todos los precios de la tienda, con su vigencia (`vigente`, `por_confirmar`, `desactualizado`) y su confiabilidad (`en_revision` incluida), ordenados por nombre de producto y presentación. El filtro opcional `onlyCurrent=true` quita los desactualizados y los en revisión, como en la comparación. Sin paginación: una tienda tiene a lo sumo un precio por presentación del catálogo.
- **Razón:** si se ocultaran los viejos, la tienda parecería no tener precio de productos que sí tienen uno; la vigencia avisa que está viejo.

### 3. ¿Caché?

- **Decisión:** `Cache-Control: public, max-age=60` y ETag; con `If-None-Match` responde 304 si nada cambió. Un precio nuevo tarda como mucho un minuto en verse (provisional).
- **Razón:** la URL no lleva la ubicación del usuario (a diferencia de la comparación, EC-08), y la regla de la API pide caché y ETag en las lecturas públicas (EC-04).

## Decisiones menores (sin pregunta)

- Una tienda que no existe responde 404; una tienda sin precios responde 200 con la lista vacía.
- La confiabilidad se calcula con el TTL de la categoría de cada presentación (fresca o no).
- La ruta entra a la lista pública del guardián de rutas (RNF-010).
