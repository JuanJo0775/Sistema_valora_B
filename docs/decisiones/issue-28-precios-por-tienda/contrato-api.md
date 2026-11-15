# Contrato — issue #28: precios vigentes de un establecimiento

## `GET /v1/establishments/{establishmentId}/prices` (nueva)

- **Seguridad:** ninguna (pública).
- **Parámetros:** `onlyCurrent` (`true` o `false`, por defecto `false`).
- **200:**

```json
{
  "establishment": {
    "id": "uuid",
    "name": "Tienda Don José",
    "type": "barrio",
    "address": "Cra. 14 # 20-10",
    "lat": 4.535,
    "lng": -75.6811
  },
  "prices": [
    {
      "productId": "uuid",
      "presentationId": "uuid",
      "productName": "Arroz Diana · 500 g",
      "reportId": "uuid",
      "priceCop": 2500,
      "unitPrice": { "valueCop": 500, "per": "100g" },
      "source": "comunidad",
      "freshness": "vigente",
      "reliability": "media",
      "confirmations": 1,
      "observedAt": "2026-11-15T13:00:00.000Z"
    }
  ]
}
```

- Orden: por `productName`.
- **304:** con `If-None-Match` igual al ETag.
- **400:** `establishmentId` que no es UUID u `onlyCurrent` inválido. **404:** la tienda no existe.
- **Cabeceras:** `Cache-Control: public, max-age=60` y `ETag`.
