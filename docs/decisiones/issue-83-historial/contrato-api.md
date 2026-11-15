# Contrato — issue #83: historial de precios

## `GET /v1/products/{productId}/history`

| Parte | Antes | Después |
|---|---|---|
| Seguridad | Sin definir | Pública, sin cuenta (RN3). |
| Parámetros | `establishmentId` (opcional) | Igual. |
| 200 | `{ points: [{ date, minPriceCop, avgPriceCop }] }` por producto | Una serie por presentación (abajo). |
| Caché | Sin definir | `public, max-age=300` y `ETag`. |
| 400 | No estaba | `productId` o `establishmentId` no son UUID. |
| 404 | No estaba | El producto no existe. |

```json
{
  "from": "2026-10-17",
  "to": "2026-11-15",
  "presentations": [
    {
      "presentationId": "uuid",
      "label": "Arroz blanco Diana 500 g",
      "points": [
        { "date": "2026-11-14", "minPriceCop": 2400, "avgPriceCop": 2550, "reports": 3, "source": "reportado" }
      ]
    }
  ]
}
```

- `from` y `to`: los 30 días, en hora de Colombia.
- Una presentación sin precios en esos días sale con `points: []`.
- `avgPriceCop` se redondea al peso.
