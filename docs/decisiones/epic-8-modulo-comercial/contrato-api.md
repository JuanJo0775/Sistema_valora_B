# Contrato API del módulo comercial (borrador, EPIC-B08)

Borrador de los cambios en `docs/openapi.yaml` que salen del grill (`grill.md`, D1 a D8). **No se edita `openapi.yaml` todavía:** cada ruta entra en el contrato en el mismo pull request que su código (`/api-contract-authoring`), como pide la regla del contrato primero. Todas van bajo `/v1`, con sesión, CSRF en los métodos que modifican y errores `{ code, message }`.

Rutas que ya estaban reservadas con `x-corte: 3`: `POST /commerce/claims`, `PUT /commerce/prices`, `POST /commerce/prices/bulk`, `POST /commerce/promotions`. Se conservan sus rutas y se completan.

## Registro y perfil (D2, D3)

### `POST /v1/commerce/claims` (reservada; se completa)

Solo el rol `reportante` con el **correo verificado**. Registra la cuenta como dueña de una tienda.

Cuerpo:

| Campo | Regla |
|---|---|
| `establishmentId` | La tienda del mapa. **O** `newEstablishment` |
| `newEstablishment` | `{ name, type, address }` si la tienda no está en el mapa (RF-005, se crea una propuesta) |
| `responsibleName` | 2 a 80 caracteres |
| `nit` | Opcional. NIT con dígito de verificación válido. Si falta, `informal: true` |
| `phone` | Celular o fijo colombiano |
| `acceptedTermsVersion` | Versión vigente de las condiciones para comercios |
| `location` | `{ lat, lng }` del celular **en el momento**. Solo para comprobar la presencia: **no se guarda** |

Respuestas:

| Código | Cuándo |
|---|---|
| `201` `{ status: "verificado" }` | Tienda del mapa y todas las validaciones bien |
| `201` `{ status: "pre_aprobado", unlocks: [...] }` | Tienda nueva: espera la aprobación de la propuesta. `unlocks` lista lo que se desbloquea |
| `400 VALIDATION_ERROR` | Campos con formato inválido (incluye NIT con dígito de verificación mal) |
| `403 EMAIL_NOT_VERIFIED` | Correo sin verificar |
| `403 FORBIDDEN` | La cuenta no es `reportante` (ya es comercio o moderador) |
| `409 ESTABLISHMENT_HAS_OWNER` | La tienda ya tiene dueño: queda una **disputa** para el moderador |
| `409 ACCOUNT_HAS_ESTABLISHMENT` | La cuenta ya tiene una tienda (una por cuenta) |
| `422 NOT_AT_ESTABLISHMENT` | La ubicación está a más de 50 m de la tienda |

### `GET /v1/commerce/me` (nueva)

Rol `comercio` (o la cuenta con una solicitud pre-aprobada). Responde la tienda, el estado (`pre_aprobado`, `verificado`, `revocado`) y las funciones desbloqueadas. Nunca la ubicación del celular.

## Precios oficiales (D1, D4, D7)

### `PUT /v1/commerce/prices` (reservada)

Rol `comercio` verificado. `{ presentationId, priceCop }` publica o actualiza el oficial de **su** tienda y lo deja reconfirmado. `200`. `403` si no está verificado.

### `GET /v1/commerce/prices` (nueva)

Sus precios oficiales con `freshness` (`vigente`, `por_confirmar`, `desactualizado`, ADR-005) y la fecha de la última confirmación.

### `POST /v1/commerce/prices/reconfirm` (nueva, D4)

Botón «Todos mis precios siguen igual». Sin cuerpo. `200 { reconfirmed: n }`. También reactiva las promociones pausadas (D6).

### `POST /v1/commerce/prices/bulk` (reservada; cambia de 202 a 200, D7)

`text/csv` con columnas `codigo_barras;precio`. Máximo **1.000 filas** (`413` si pasa). Procesa al momento:

```json
{
  "published": 785,
  "errors": [
    { "row": 12, "barcode": "7702001023456", "code": "UNKNOWN_BARCODE", "message": "Este código no está en Valora: propón el producto." }
  ]
}
```

Códigos de fila: `INVALID_PRICE`, `UNKNOWN_BARCODE`, `DUPLICATE_ROW`. Las filas buenas se publican y reconfirman; volver a subir actualiza sin duplicar.

## Promociones (D6)

### `POST /v1/commerce/promotions` (reservada)

El esquema `Promotion` gana `conditions`:

```json
{ "maxPerCustomer": 2, "whileStocksLast": true, "paymentMethod": "efectivo" }
```

`paymentMethod`: `cualquiera` | `efectivo` | `tarjeta`. Sin texto libre. `422 OFFICIAL_PRICE_REQUIRED` si la presentación no tiene un oficial **vigente**.

### `GET /v1/commerce/promotions` y `DELETE /v1/commerce/promotions/{promotionId}` (nuevas)

Listar las suyas, con estado `activa`, `pausada` o `vencida`, y retirarlas.

## Datos de la tienda (D5)

### `PATCH /v1/commerce/establishment` (nueva)

`{ openingHours?, phone?, name?, location? }`. Horario, teléfono y nombre se aplican al instante, salvo un nombre equivalente a otra tienda a menos de 50 m, que va a revisión. `location` crea siempre una propuesta para el moderador. Responde qué se aplicó y qué quedó en revisión. `commerce` lo pide a `establishments` por su `index.ts`.

## Denuncias, disputas y revocación (D2, D3)

| Ruta | Quién | Qué |
|---|---|---|
| `POST /v1/establishments/{establishmentId}/merchant-reports` | Cualquier cuenta con sesión | «Este comercio no es de quien dice», con motivo de 10 a 500 caracteres. `202` |
| `GET /v1/moderation/merchant-cases` | Moderador | Disputas (dos cuentas por la misma tienda) y denuncias pendientes |
| `POST /v1/moderation/merchant-cases/{caseId}/decision` | Moderador | `revocar` o `descartar`, con motivo. Revocar retira al instante precios y promociones y devuelve la cuenta a `reportante` |

## Avisos para el comercio (ADR-008, D4)

### `GET /v1/commerce/alerts` (nueva)

Discrepancias corroboradas («la comunidad reporta $4.800 y tu oficial es $4.000») y recordatorios de reconfirmación. También salen por correo (Resend).

## Comparación (D1, D6): `GET /v1/products/{productId}/comparison`

Cambio que **afecta al frontend**:

- `ComparisonItem.source` ya admite `oficial` (hoy siempre `comunidad`).
- `reportId` deja de ser obligatorio: un precio `oficial` no viene de un reporte. **Cambio incompatible para los tipos de la PWA**: va en un pull request coordinado con el frontend (regenerar tipos con `openapi-typescript`).
- Nuevo `discrepancy` (solo con discrepancia corroborada): `{ officialPriceCop, reportedPriceCop, reports, since }`. El `priceCop` del resultado es la **mediana** reportada (D1) y es el que entra al orden.
- `promotions` (ya reservado) se llena, con `conditions` y `establishmentId`, siempre aparte de `results` (ADR-009).
- El historial de 30 días **no cambia** (D8).

## Eventos internos (contrato entre módulos, ADR-015)

`MerchantVerified`, `MerchantRevoked`, `OfficialPricePublished`, `OfficialPriceWithdrawn`, `PromotionPublished`, `PromotionWithdrawn`, todos en versión 1. `comparison`, `identity` y `reliability` los reciben; el núcleo nunca importa `commerce` (regla `nucleo-no-conoce-commerce`).
