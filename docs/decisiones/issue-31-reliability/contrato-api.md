# Contrato — issue #31: confiabilidad en la comparación

Cambios en `docs/openapi.yaml` (primer pull request) y en los eventos internos. No hay rutas nuevas.

## `GET /v1/products/{productId}/comparison`

### `ComparisonItem`

| Campo | Antes | Después |
|---|---|---|
| `reliability` | Opcional, «desde la #31» | Requerido: `alta`, `media` o `baja` según el score al momento de la consulta (preguntas 6 y 7 de la #19); `en_revision` si el único precio de esa tienda quedó sospechoso (pregunta 5). |
| `confirmations` | Opcional, «desde la #31» | Requerido: cuántas cuentas distintas confirman el precio (corroboraciones de la #19). |
| `isCheapest` | Entre vigentes y por confirmar | Agrega: un precio `en_revision` nunca es el más barato. |

### `Comparison.results`

Agrega a la descripción: los precios `en_revision` van al final, junto con los desactualizados, y no compiten en el orden (pregunta 5). Con `onlyCurrent=true` no aparecen.

## Eventos internos (ADR-015)

No son parte de la API REST, pero son contratos entre módulos: un cambio de forma exige una versión nueva.

### `PriceReported` versión 2 (publica `pricing`)

Los campos de la versión 1 más:

| Campo | Qué es |
|---|---|
| `reporterKey` | `HMAC-SHA256(REPORTER_KEY_SECRET, id de la cuenta)`, en hexadecimal. Estable por cuenta y no reversible sin el secreto. |
| `reporterSince` | Fecha de creación de la cuenta (AAAA-MM-DD), para saber si es nueva. |

Sigue sin correo, sin id de cuenta y sin ubicación (EC-08).

### `PriceAssessed` versión 1 (publica `reliability`, escucha `comparison`)

```json
{
  "reportId": "uuid",
  "presentationId": "uuid",
  "establishmentId": "uuid",
  "priceCop": 4500,
  "priceType": "normal",
  "observedAt": "2026-11-14T14:00:00.000Z",
  "receivedAt": "2026-11-14T14:00:03.000Z",
  "verdict": "normal",
  "reason": null
}
```

`verdict` es `normal`, `sospechoso` o `sin_datos`; `reason` es `rango` o `coordinacion` cuando es `sospechoso`. No lleva `reporterKey`: `comparison` no lo necesita.
