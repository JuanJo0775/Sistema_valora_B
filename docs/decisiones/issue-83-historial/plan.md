# Plan — issue #83: historial de precios

- **Rama:** `feat/comparison-historial` (desde `dev`). Pull request hacia `dev` con `Closes #83`.
- **Relación:** Corte 2, épica #6. RF-008 (RN1, RN3, RN4), EC-02, EC-04, EC-08.
- **Decisiones:** `grill.md` (7 preguntas). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna. **Migración:** `comparison.price_history`.

## Ciclos TDD

1. **Dominio `dailyHistory`:** agrupa por presentación y por día de Colombia, con mínimo, promedio redondeado y cantidad; solo los últimos 30 días.
2. **Persistencia (integración):** `PriceAssessed` guarda el precio; un sospechoso no cuenta hasta que se aprueba; `PriceWithdrawn` lo saca; el mismo evento dos veces no duplica.
3. **`PriceHistory` (caso de uso):** una serie por presentación con su nombre, filtrada por tienda si se pide; producto inexistente → no encontrado.
4. **HTTP:** 200 público con caché y ETag, 400, 404; sin datos de quién reportó.
5. **Reconstrucción:** `pnpm comparison:rebuild-history` aplica los eventos ya entregados del outbox y se puede repetir.

## Otras tareas

- **Documentos:** `openapi.yaml`, README, `DECISIONS.md`; guardián de rutas públicas y privacidad de respuestas.
- **Notion:** EPIC-B06 y RF-008.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
