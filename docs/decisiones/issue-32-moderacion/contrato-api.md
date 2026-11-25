# Contrato — issue #32: marcar, cola y decisiones de moderación

Cambios en `docs/openapi.yaml` y en los eventos internos, en el mismo pull request que el código.

## `POST /v1/reports/{reportId}/flag`

| Parte | Antes | Después |
|---|---|---|
| Seguridad | Sesión y CSRF | Sesión de `reportante` y CSRF (pregunta 7). |
| `comment` | Hasta 280 | Sin cambios. |
| 202 | Señal recibida | Sin cambios: el reporte entra a la cola (pregunta 3). |
| 400 | No estaba | `BadRequest` (motivo fuera de la lista). |
| 401 | Sí | Sin cambios. |
| 403 | No estaba | `Forbidden` (otro rol o sin CSRF). |
| 404 | Sí | El reporte no existe para `reliability`. |
| 409 | No estaba | `ALREADY_FLAGGED`: esa cuenta ya marcó ese reporte (pregunta 5). |

## `GET /v1/moderation/queue`

| Parte | Antes | Después |
|---|---|---|
| Seguridad | Sesión | Sesión de `moderador`. |
| Orden | Sin descripción | `desviacion` primero (mayor desviación primero), luego `marcado` (más marcas primero); en empate, el más antiguo (pregunta 6). |
| `reason` | Filtro | Sin cambios; hoy solo aparecen `desviacion` y `marcado`. |
| 401 | No estaba | `Unauthorized`. |
| 403 | Sí | Sin cambios. |

### `ModerationItem`

| Campo | Antes | Después |
|---|---|---|
| `required` | `id`, `reason`, `reportedPriceCop`, `medianPriceCop` | Sin `medianPriceCop` (un marcado `sin_datos` no tiene mediana); se agregan `productName`, `establishmentName`, `reportersCount` y `createdAt`. |
| `id` | uuid | Es el id del reporte. |
| `productName` | Opcional | Nombre del producto y la presentación (por ejemplo, «Arroz Diana · 500 g»). |
| `reportersCount` | Opcional | Cuántas cuentas lo marcaron como dudoso. |
| `officialPriceCop` | Opcional | Sin cambios (Corte 3). |

No lleva quién reportó ni quién marcó.

## `POST /v1/moderation/{itemId}/decision`

| Parte | Antes | Después |
|---|---|---|
| `note` | Opcional, hasta 500 | **Obligatoria**, de 10 a 500 caracteres (RN3; pregunta 5). |
| `decision` | `aprobar`, `descartar`, `observar_cuentas` | Sin cambios; `observar_cuentas` solo queda en la bitácora hasta la #33. |
| 204 | Decisión registrada | Sin cambios. |
| 400 | No estaba | `BadRequest` (sin motivo o motivo corto). |
| 401 | No estaba | `Unauthorized`. |
| 403 | Sí | Sin cambios (otro rol o sin CSRF). |
| 404 | Sí | El reporte no está en la cola (no existe o ya se decidió). |

## `GET /v1/products/{productId}/comparison`

`ComparisonItem` agrega `reportId` (requerido): el reporte que se muestra, para marcarlo (pregunta 3).

## Eventos internos

- **`PriceAssessed` v1:** sin cambios; `reliability` lo vuelve a publicar con `verdict: normal` al aprobar.
- **`PriceWithdrawn` v1 (nuevo, publica `reliability`, escucha `comparison`):**

```json
{
  "reportId": "uuid",
  "presentationId": "uuid",
  "establishmentId": "uuid",
  "replacement": {
    "reportId": "uuid",
    "priceCop": 2500,
    "priceType": "normal",
    "observedAt": "2026-11-14T14:00:00.000Z",
    "receivedAt": "2026-11-14T14:00:03.000Z"
  }
}
```

`replacement` es `null` si no queda otro precio confiable en esa tienda. `comparison` solo actúa si el precio que muestra es el retirado.

## Precisión H25 (24 de noviembre de 2026)

Cada elemento de la cola con mediana suma `deviationDirection` (`menor` o `mayor`): `deviationPercent` va sin signo y el cliente no debe deducirlo. Sin mediana, o con el precio igual a ella, el campo no está. Cambio aditivo.
