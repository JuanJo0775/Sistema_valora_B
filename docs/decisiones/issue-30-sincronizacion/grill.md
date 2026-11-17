# Grill — issue #30: sincronización sin conexión, lado del servidor

- **Fuentes:**
  - Issue #30 (Corte 2, épica #4): lado del servidor de la cola sin conexión (ADR-010). 50 registros sincronizados: 100 % recibidos, 0 duplicados, p95 de 60 s o menos (PR-08); un reporte tardío no reemplaza uno más reciente según la hora de observación; la cola en IndexedDB y Playwright van en Sistema_valora_F.
  - ADR-010 (DECISIONS.md): el backend acepta reintentos idempotentes; la cola vive en el frontend. `Sistema_valora_F/docs/OFFLINE_FIRST.md`: la PWA guarda cada reporte con su clave y su hora de observación, y reintenta con la misma clave.
  - Código existente: `POST /v1/reports` idempotente por `Idempotency-Key` (#14, EC-07); precio vigente por mayor `observedAt` (#14, ADR-004); límites de la #29: observación de hasta 24 h, duplicado (misma presentación y tienda en 60 min) y ráfaga (más de 20 por hora), contados por la hora de **llegada**.
- **Fecha:** 2026-11-15.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Cómo llegan los reportes de la cola?

- **Decisión:** uno a uno, a `POST /v1/reports`, cada uno con su clave; sin ruta de lotes. La #30 lo demuestra con una prueba de 50 reportes enviados a la vez, en desorden y con reintentos repetidos.
- **Razón:** el servidor ya es idempotente y ADR-010 no pide lotes; una ruta de lotes duplicaría validaciones, errores parciales, contrato y pruebas.

### 2. ¿Qué pasa con los límites de la #29?

- **Decisión:** la ráfaga y el duplicado cuentan por la **hora de observación**, no por la de llegada.
  - Duplicado: la misma cuenta, presentación y tienda con observaciones a menos de 60 minutos.
  - Ráfaga: más de 20 reportes de la cuenta observados dentro de una misma hora.
  - Así 50 reportes vistos a lo largo del día pasan aunque lleguen juntos, y 21 vistos en la misma hora siguen siendo una ráfaga, lleguen cuando lleguen.
- **Razón:** contando por la llegada, al reconectar la cola chocaba con el límite desde el reporte 21 y PR-08 (100 % recibidos) no se cumplía.
- **Límite conocido:** quien quiera evitar la ráfaga puede repartir horas de observación falsas dentro de las 24 h permitidas; la detección de anómalos (#20, #31) y la moderación siguen aplicando.

### 3. ¿Qué hace la cola con cada respuesta?

- **Decisión:** una regla por código, documentada en el contrato (el servidor no cambia):

| Respuesta | Qué hace la cola |
|---|---|
| 201 o 200 | Confirmado: sale de la cola. |
| 400, 409 o 422 | Final: sale de la cola y avisa por qué. |
| 429 (ráfaga) | Final para un reporte que ya estaba en la cola (su hora de observación no cambia, así que no pasará): sale de la cola y avisa. |
| 401 o 403 | Pide iniciar sesión y espera; luego reintenta con la misma clave. |
| Sin red o 5xx | Reintenta más tarde con la misma clave. |

- **Razón:** la PWA necesita saber qué respuestas son finales para no reintentar para siempre; el 429 conserva su `Retry-After` para el reporte en vivo.
