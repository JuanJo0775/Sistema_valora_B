# Contrato API — issue #15: `GET /v1/products/{productId}/comparison`

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código. Cada cambio cita la pregunta del grill que lo decide.

## Ruta

- **Descripción:** se agrega la nota de privacidad de `/nearby`: la ubicación del usuario solo sirve para calcular la cercanía; no se guarda, no se registra en los logs ni aparece en la respuesta (RF-005 RN5, EC-08). Por eso la respuesta lleva `Cache-Control: no-store` (pregunta 3).

| Parámetro | Antes | Después |
|---|---|---|
| `lat`, `lng` | Requeridos | Sin cambios. |
| `radiusKm` | De 0,2 a 10, 2 por defecto | De 0,5 a 3, 2 por defecto, con la misma descripción de `/nearby` (pregunta 3). |
| `sort` | `unit_price`, `distance`, `recent`; `unit_price` por defecto | Sin cambios en los valores. La descripción explica la cadena de desempate de la #21 (pregunta 8). |
| `onlyCurrent` | «Solo incluye precios vigentes (excluye los por confirmar)» | Aclara que también excluye los desactualizados (pregunta 5). |

| Respuesta | Antes | Después |
|---|---|---|
| 200 | `Cache-Control` público y `ETag` | `Cache-Control: no-store`, sin `ETag` (pregunta 3). |
| 400 | No estaba | `BadRequest`: `productId` que no es UUID; `lat` o `lng` ausentes o fuera de rango; `radiusKm` fuera de 0,5 a 3; `sort` desconocido (pregunta 9). |
| 404 | `NotFound` | Sin cambios: el producto no existe (pregunta 9). |
| 422 | No estaba | `INCOMPATIBLE_UNITS`: el producto mezcla bases de unidad; no debería pasar con la #59 (pregunta 9). |

## Esquema `Comparison`

| Campo | Antes | Después |
|---|---|---|
| `criteria` | Opcional, con `sort` y `radiusKm` | Requerido, con `sort` y `radiusKm` requeridos: el orden declarado (EC-06). |
| `cheapestPriceCop`, `averagePriceCop` | Opcionales | Salen del contrato (pregunta 6). |
| `results` | Sin descripción de orden | Primero los precios `vigente` y `por_confirmar`, ordenados por el criterio declarado; al final los `desactualizado`, ordenados entre sí con el mismo criterio (pregunta 5). |
| `promotions` | «Siempre separadas del resultado» | Agrega: siempre vacío hasta el módulo comercial, en el corte 3 (pregunta 6). |

## Esquema `ComparisonItem`

| Campo | Antes | Después |
|---|---|---|
| `required` | Incluye `reliability` | Sin `reliability` (pregunta 4); se agrega `isCheapest`. |
| `establishment` | `Establishment` | Sin cambios; `distanceM` siempre viene en la comparación. Se actualiza la descripción de `distanceM` en `Establishment`. |
| `source` | `comunidad`, `oficial`, `siembra` | Sin cambios en los valores; la descripción dice que hoy siempre es `comunidad` (pregunta 7). |
| `reliability` | Requerido | Opcional, «desde la #31» (pregunta 4). |
| `confirmations` | Opcional | «Desde la #31» (pregunta 6). |
| `isCheapest` | Opcional, sin descripción | Requerido: `true` en el precio más bajo por unidad (valor exacto) entre los vigentes y por confirmar; si varios empatan, en todos. Un desactualizado siempre es `false` (preguntas 5 y 6). |

## Ejemplo de 200

```json
{
  "productId": "7c1f0c7e-3a52-4c64-9a52-0d3b1f6a2b10",
  "criteria": { "sort": "unit_price", "radiusKm": 2 },
  "results": [
    {
      "establishment": {
        "id": "0d6f8a7e-5b1c-4a8e-9f2d-3c4b5a6e7f80",
        "name": "Tienda La Esquina",
        "type": "barrio",
        "lat": 4.5339,
        "lng": -75.6811,
        "distanceM": 420
      },
      "presentationId": "a3b4c5d6-e7f8-4a9b-8c0d-1e2f3a4b5c6d",
      "priceCop": 4000,
      "unitPrice": { "valueCop": 400, "per": "100g" },
      "source": "comunidad",
      "freshness": "vigente",
      "isCheapest": true,
      "observedAt": "2026-11-12T14:00:00.000Z"
    }
  ],
  "promotions": []
}
```

Sin nada del reportante ni la ubicación del usuario (EC-08).
