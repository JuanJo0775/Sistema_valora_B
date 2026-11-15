# Contrato — issue #26: propuestas de productos, alias e imágenes

## `Product` (en `GET /v1/products` y `GET /v1/products/{productId}`)

Gana `image` (opcional): `{ "url": "https://…", "source": "open_food_facts" | "equipo", "attribution": "…" }`. Sin `image`, el frontend muestra la ilustración genérica.

## `GET /v1/products?q=`

La búsqueda también encuentra por alias.

## `POST /v1/product-requests`

| Parte | Antes | Después |
|---|---|---|
| Seguridad | Sesión y CSRF | Sesión de `reportante` y CSRF. |
| Cuerpo | `name`, `barcode`, `quantity`, `unit` | `name` (2 a 120), `brand` (opcional, hasta 80), `categoryCode`, `quantity`, `unit`, `packCount` (por defecto 1), `barcode` (opcional, EAN válido). |
| 202 | Sin cuerpo | `{ "id": "uuid", "status": "pendiente" }` |
| 400 | No estaba | Datos inválidos (también el dígito de control). |
| 403 | No estaba | Otro rol o sin CSRF. |
| 409 | No estaba | `BARCODE_TAKEN`: el código ya es de un producto; `message` dice cuál (`productId`). |
| 422 | No estaba | `UNKNOWN_CATEGORY`. |

## `GET /v1/moderation/product-requests` (nueva)

Moderador; `no-store`. `{ "items": [ { "id", "name", "brand", "categoryCode", "quantity", "unit", "packCount", "barcode", "possibleDuplicates": [ { "id", "name" } ], "createdAt" } ] }`, la más antigua primero, sin datos de quien propuso.

## `POST /v1/moderation/product-requests/{requestId}/decision` (nueva)

Moderador y CSRF. `{ "decision": "aprobar" | "fusionar" | "rechazar", "note": "…", "mergeInto": "uuid" }` (`mergeInto` solo y siempre con `fusionar`). 204; 400; 404 (no existe o ya se decidió); 422 `UNKNOWN_PRODUCT` o `MIXED_UNIT_BASES`.
