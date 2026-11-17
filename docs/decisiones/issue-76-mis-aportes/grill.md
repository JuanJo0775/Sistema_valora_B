# Grill — issue #76: lista de mis aportes con su estado

- **Fuentes:**
  - Issue #76 (sale del grill de la #71, pregunta 1): `GET /v1/me/reports` con los aportes de la cuenta, su estado y hasta cuándo se pueden apelar, sin datos de quién decidió ni quién marcó (EC-08).
  - RF-006 (Notion): el reportante consulta sus aportes.
  - Código existente: `reliability.observations` (copia de cada reporte evaluado, con la clave seudónima del autor y la moderación), `ReportStatus` y sus 6 estados (#71), `PresentationLabels` y `EstablishmentNames` (#32). El contrato tenía `/me/reports` con `ReportReceipt` (`recibido`, `en_revision`, `vigente`, `descartado`), sin construir.
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿De dónde sale la lista?

- **Decisión:** solo de `reliability`: las observaciones de la clave seudónima del autor, con los nombres de `catalog` y `establishments`. No toca `pricing`. Un reporte recién enviado aparece cuando `reliability` lo evalúa (segundos, por el outbox); los reportes de antes de la #31 no aparecen.
- **Razón:** `reliability` ya tiene todo lo que la lista muestra (precio, presentación, tienda, fechas y estado); juntar `pricing` con `reliability` crearía una dependencia nueva entre módulos del núcleo.

### 2. ¿Qué trae cada aporte y cómo se pagina?

- **Decisión:** `reportId`, `productName`, `establishmentName`, `priceCop`, `priceType`, `observedAt`, `status` (los 6 estados de la #71) y `appealableUntil` si todavía se puede apelar. El más reciente primero (por fecha de llegada). `limit` de 20 por defecto (50 máximo) y el cursor `before` (fecha): la respuesta trae `nextBefore` cuando puede haber más. Reemplaza `ReportReceipt` en esta ruta.
- **Razón:** es lo que la pantalla «Mis aportes» necesita, y una cuenta con muchos aportes puede ver los viejos.

## Decisiones menores (sin pregunta)

- El estado se calcula con la misma regla que `GET /v1/me/reports/{reportId}/status`; esa regla se extrae a una función para que las dos rutas no se aparten.
- Una cuenta suspendida también ve su lista (`@AllowSuspended`), igual que el estado de un reporte (#71).
- `Cache-Control: no-store`: la lista es privada.
