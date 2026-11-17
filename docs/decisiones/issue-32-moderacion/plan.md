# Plan — issue #32: marcar, cola y decisiones de moderación

- **Rama:** `feat/reliability-moderacion` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #32`.
- **Relación:** Corte 2, épica #5. RF-013 (RN1, RN2, RN3), EC-03, EC-08, PR-11, PR-14.
- **Decisiones:** `grill.md` (7 preguntas). Contrato y eventos: `contrato-api.md`.
- **Fuera de alcance:** suspensión por rechazos y efecto de `observar_cuentas` (#33); apelación (issue nueva); conflicto de interés con comercios (Corte 3); ruta para consultar la bitácora.
- **Dependencias nuevas:** ninguna.

## Diseño

1. **Soporte:** `catalog` expone `PresentationLabels.of(ids)` (nombre del producto y presentación) y `establishments` expone `EstablishmentNames.of(ids)`.
2. **`reliability`, persistencia (migración `0013_reliability-moderation`):**
   - `observations` gana `moderation` (`null`, `aprobado` o `descartado`): la moderación cambia el estado, no borra.
   - `flags` con llave (`report_id`, `flagger_key`).
   - `moderation_log` con un trigger que rechaza `UPDATE` y `DELETE`.
3. **`reliability`, casos de uso:**
   - `FlagReport`: marca una vez por cuenta (clave seudónima); reporte desconocido → no encontrado; repetido → `AlreadyFlaggedError` (409).
   - `ModerationQueue`: pendientes por `desviacion` o `marcado`, con nombres, orden por gravedad, filtro y límite.
   - `DecideModeration`: exige motivo; registra en la bitácora; `aprobar` → `aprobado` y `PriceAssessed` normal; `descartar` → `descartado`, `rejected` a la reputación del autor y `PriceWithdrawn` con el reemplazo; `observar_cuentas` → solo bitácora.
   - Un reporte `descartado` deja de contar en referencias, score y confirmaciones; uno `aprobado` cuenta como normal.
4. **`comparison`:** suscriptor de `PriceWithdrawn`; `reportId` en cada resultado.
5. **HTTP:** `ModerationController` (`/moderation/queue`, `/moderation/{itemId}/decision`) y `POST /reports/{reportId}/flag`, con `SessionGuard` y `@Roles`. La ruta de marcar vive en `reliability`, aunque cuelgue de `/reports`.
6. **Contrato:** `docs/openapi.yaml` según `contrato-api.md`. `docs/ARCHITECTURE.md` se corrige: la moderación es parte de `reliability`.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay una refactorización real. Una prueba que pase sin código nuevo se sube como caracterización y su commit lo dice.

**Soporte (integración):**

1. `PresentationLabels` y `EstablishmentNames` devuelven los nombres por id.

**Persistencia (integración):**

2. Las marcas no se repiten por cuenta y reporte; la bitácora rechaza `UPDATE` y `DELETE`; la moderación cambia el estado de una observación.

**`FlagReport`:**

3. Una cuenta marca un reporte y queda registrada con su motivo.
4. La misma cuenta no puede marcarlo dos veces; un reporte desconocido no se puede marcar.

**`ModerationQueue`:**

5. Muestra los sospechosos (`desviacion`) y los marcados (`marcado`) pendientes, con nombres y sin claves.
6. Ordena por gravedad (desviación, marcas, antigüedad), filtra por motivo y respeta el límite.
7. Un reporte decidido sale de la cola.

**`DecideModeration`:**

8. Sin motivo (o con menos de 10 caracteres) no se registra.
9. Aprobar deja el reporte `aprobado`, lo registra en la bitácora y publica `PriceAssessed` normal.
10. Descartar deja el reporte `descartado`, baja 0,20 la reputación del autor y publica `PriceWithdrawn` con el reemplazo más reciente confiable (o sin reemplazo).
11. `observar_cuentas` solo queda en la bitácora.
12. Un reporte descartado no cuenta como referencia ni para el score; uno aprobado cuenta como normal.

**`comparison` (integración):**

13. `PriceWithdrawn` reemplaza el precio retirado o borra la fila; si el precio que se muestra es otro, no hace nada.

**HTTP:**

14. Marcar: 202, 401 sin sesión, 403 con otro rol o sin CSRF, 404 y 409.
15. Cola: 200 para moderador; 403 para reportante; 401 sin sesión.
16. Decisión: 204, 400 sin motivo, 403 y 404.
17. La comparación trae `reportId`.
18. **De punta a punta:** un reportante marca el precio que se muestra, el moderador lo ve en la cola y lo descarta, y la comparación vuelve al precio confiable anterior; la cola no lleva datos de los reportantes (EC-08).

## Otras tareas

- **Issue nueva:** apelación de un reporte rechazado, revisada por otro moderador (RN4).
- **Comentario en la #33:** suspensión por N rechazos seguidos (RN6) y efecto de `observar_cuentas`.
- **README:** cómo crear un moderador en desarrollo.
- **Notion:** EPIC-B05 y RF-013.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build`, `test:cov --runInBand` y `reliability:evaluate` en verde.
