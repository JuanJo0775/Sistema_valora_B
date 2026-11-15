# Contrato — issue #27: propuestas de tiendas

## `POST /v1/establishment-proposals` (nueva)

- **Seguridad:** sesión de `reportante` y `X-CSRF-Token`.
- **Cuerpo:** `{ "name": "Tienda Esperanza", "type": "barrio", "lat": 4.5339, "lng": -75.6811, "address": "Cra. 14 # 20-10" }` (`address` opcional; `name` de 2 a 120 caracteres).
- **202:** `{ "id": "uuid", "status": "pendiente" }`. **400**, **401**, **403**.

## `GET /v1/moderation/store-proposals` (nueva)

- **Seguridad:** sesión de `moderador`. **Cache-Control:** `no-store`.
- **200:** `{ "items": [ { "id", "name", "type", "address", "lat", "lng", "outOfZone": false, "possibleDuplicates": [ { "id", "name", "distanceM" } ], "createdAt" } ] }`, la más antigua primero. Sin datos de quien propuso.

## `POST /v1/moderation/store-proposals/{proposalId}/decision` (nueva)

- **Seguridad:** sesión de `moderador` y `X-CSRF-Token`.
- **Cuerpo:** `{ "decision": "aprobar" | "fusionar" | "rechazar", "note": "…", "mergeInto": "uuid" }` (`mergeInto` solo y siempre con `fusionar`; `note` de 10 a 500 caracteres).
- **204.** **400** (cuerpo inválido). **404** (no existe o ya se decidió). **422** `UNKNOWN_ESTABLISHMENT` (fusionar con una tienda que no existe).
