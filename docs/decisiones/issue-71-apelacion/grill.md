# Grill — issue #71: apelación de un reporte descartado

- **Fuentes:**
  - Issue #71 (separada de la #32, pregunta 1): el autor de un reporte descartado apela una sola vez, con motivo; la revisa un moderador distinto del que descartó; la decisión queda en la bitácora inmutable; si se acepta, el reporte vuelve a contar y se revierte la baja de reputación; el autor no ve quién decidió ni quién marcó (EC-08).
  - RF-013 RN4 (Notion): el autor de un reporte rechazado puede apelar una vez; otro moderador lo revisa.
  - Código existente: cola y decisiones de la #32 (`moderation_log` guarda la clave seudónima de quien decide); racha de descartes y suspensión de la #33 (`ReporterSuspensionRequested`); un moderador no decide sus propios reportes (#73); `GET /v1/me/reports` está en el contrato, pero no existe.
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Cómo apela el autor?

- **Decisión:** dos rutas en `reliability`:
  - `POST /v1/reports/{reportId}/appeal`: solo el autor, con un motivo de 10 a 500 caracteres;
  - `GET /v1/me/reports/{reportId}/status`: el estado del reporte para su autor (normal, en revisión, descartado, apelación pendiente, aceptada o rechazada) y hasta cuándo puede apelar, sin decir quién decidió ni quién marcó.

  Un reporte de otra cuenta responde 404 en las dos, para no revelar que existe. `GET /v1/me/reports` (la lista) queda para otra issue.
- **Razón:** sin ver el estado, el frontend no sabe qué reportes se pueden apelar; la lista completa toca `pricing` y agranda la issue.

### 2. ¿Hasta cuándo se puede apelar?

- **Decisión:** hasta 7 días después del descarte (provisional, ADR-005). Después responde 422 `APPEAL_WINDOW_CLOSED`.
- **Razón:** pasado ese tiempo el precio ya no está vigente y aceptar la apelación casi no cambia la comparación.

### 3. ¿Cómo llega la apelación al moderador?

- **Decisión:** entra a la misma cola con el motivo nuevo `apelacion`, antes que todos los demás (es un caso ya revisado que espera respuesta). Muestra el motivo del autor, nunca quién descartó. Se decide con la misma ruta: `aprobar` acepta la apelación y `descartar` la rechaza; `observar_cuentas` no aplica (422 `DECISION_NOT_ALLOWED`). Si decide el mismo moderador que descartó: 409 `SAME_MODERATOR`. El autor tampoco decide (409 `OWN_REPORT`, #73).
- **Razón:** reutiliza la cola, la decisión, la bitácora y sus pruebas.

### 4. ¿Qué pasa si se acepta?

- **Decisión:** el reporte queda `aprobado`, se publica de nuevo `PriceAssessed` como normal y el autor recupera 0,20 de reputación (paso `appealAccepted` en el dominio). Para la racha de RN6, el descarte revertido cuenta como `aprobar`. Para levantar la suspensión que pudo causar ese descarte, `reliability` publica `ReporterSuspensionLifted` con la fecha de fin que ese descarte habría puesto (descarte + 7 días), e `identity` la levanta solo si la fecha de la cuenta es esa. Si el descarte no suspendió, o una suspensión posterior por otra causa la cambió, no pasa nada. (Ajuste al construir: así no hace falta reconstruir el orden de la racha.) Una apelación rechazada no suma otro descarte a la racha ni otra baja de reputación.
- **Razón:** una cuenta honesta no debe seguir castigada por un error ya corregido.

### 5. ¿Cómo apela una cuenta que el descarte suspendió? (hueco encontrado al construir)

- **Decisión:** una cuenta suspendida sí inicia sesión, pero con una sesión limitada: solo puede ver el estado de sus reportes, apelar, ver su sesión (que dice `suspendedUntil`) y cerrarla (`@AllowSuspended`). Las demás rutas responden 403 `ACCOUNT_SUSPENDED`. Cambia la pregunta 4 de la #33: el login ya no responde 403.
- **Razón:** con el login bloqueado, la cuenta no podía apelar el descarte que la suspendió (el plazo de 7 días vencía junto con la suspensión) y el levantamiento de la pregunta 4 nunca serviría.

## Decisiones menores (sin pregunta)

- **Bitácora:** `moderation_log` gana la columna `stage` (`revision` o `apelacion`); las decisiones de la #32 son `revision`. La apelación se guarda en `reliability.appeals` (una por reporte) con el motivo y la fecha.
- La apelación pendiente sale de la cola cuando se decide.
