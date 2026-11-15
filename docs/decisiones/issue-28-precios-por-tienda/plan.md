# Plan — issue #28: precios vigentes de un establecimiento

- **Rama:** `feat/comparison-precios-por-tienda` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #28`.
- **Relación:** Corte 2, épica #6. RF-008, EC-02, EC-04.
- **Decisiones:** `grill.md` (3 preguntas). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna. **Migraciones:** ninguna.

## Diseño

1. **Consultas públicas nuevas:** `establishments` expone `EstablishmentDetails.find(id)`; `catalog` expone `PresentationsForPricing.of(ids)` (producto, nombre, cantidad, unidad, unidades por empaque y si la categoría es fresca).
2. **`comparison`:** `CurrentPrices.findByEstablishment(id)` y el caso de uso `StorePrices`, que arma cada precio con la misma regla de la comparación (precio por unidad, vigencia, confiabilidad).
3. **HTTP:** `GET /v1/establishments/{establishmentId}/prices` en `comparison`, con caché de 60 s y ETag.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

1. **Soporte (integración):** el detalle de una tienda por id (o null) y las presentaciones por id con su producto, su nombre y su categoría.
2. **Persistencia (integración):** los precios vigentes de una tienda en `price_current`.
3. **`StorePrices`:** cada precio con su producto, su precio por unidad, su fuente, su vigencia, su confiabilidad y sus confirmaciones, ordenados por producto.
4. **`StorePrices`:** un precio en revisión dice `en_revision`; `onlyCurrent` quita los desactualizados y los en revisión; una tienda que no existe da null.
5. **HTTP:** 200 con la forma del contrato, `Cache-Control` y ETag (304 con `If-None-Match`); 404; 400. La ruta entra a la lista pública del guardián.

## Otras tareas

- **Documentos:** `openapi.yaml`, README y `DECISIONS.md`.
- **Notion:** EPIC-B06 y RF-008.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
