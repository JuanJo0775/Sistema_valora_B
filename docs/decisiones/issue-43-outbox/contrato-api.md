# Contrato API — issue #43: bus de eventos con outbox

**No cambia `docs/openapi.yaml`.** El bus de eventos es interno: no agrega rutas ni cambia respuestas.

Los contratos de evento no son parte de la API REST. Se documentan en el código (`src/shared/events/`) con su tipo y su versión (ADR-015). Los primeros eventos reales, como `PrecioReportado`, llegan con el módulo `pricing` (issue #14).
