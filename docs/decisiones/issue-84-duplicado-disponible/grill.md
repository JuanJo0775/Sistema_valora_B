# Grill — issue #84: el reporte duplicado dice cuándo se puede volver a reportar

- **Relación:** RF-006 (RN5, escenario «Límite de frecuencia»), PR-06, #29, #30.
- **Fecha:** 15 de noviembre de 2026.

## Pregunta 1: ¿qué dice el 409 `DUPLICATE_REPORT`?

**Contexto:** desde la #30, el duplicado se mide por la hora de observación, no por la de llegada. Un reporte de la cola sin conexión tiene su hora de observación fija: esperar y reintentar el mismo reporte nunca pasa. Lo útil es decir **desde qué hora de observación** se acepta un reporte nuevo de esa presentación en esa tienda.

| Opción | A favor | En contra |
|---|---|---|
| Campo `availableFrom` y mensaje con la hora | El frontend no adivina; la persona lee la hora | Extiende el formato `{ code, message }` en un solo error |
| Solo el mensaje | No cambia el formato | El frontend solo puede mostrarlo |
| Cabecera `Retry-After` | Igual que el 429 | Engaña a la cola: reintentar el mismo reporte nunca pasa |

**Decisión:** campo `availableFrom` (fecha ISO) y mensaje con la hora de Colombia: «Ya reportaste esta presentación en esta tienda. Puedes reportarla de nuevo con una observación desde las 09:30.»

## Regla

`nextAllowedObservation` en `src/domain/report-limits.ts`: la primera hora, desde la observación rechazada, que no queda a menos de 60 minutos de ningún reporte de la cuenta para esa presentación en esa tienda. Si la hora siguiente también choca con otro reporte, salta hasta después de ese.

**Límite conocido:** se miran los reportes a menos de una hora de la observación. Si hay otro más adelante, el siguiente intento puede recibir otro 409 con una hora nueva.

## Contrato

`ConflictError` en `docs/openapi.yaml`: `{ code, message, availableFrom? }`, solo para el 409 `DUPLICATE_REPORT` de `POST /v1/reports`. El esquema `Error` sigue con solo `code` y `message`.
