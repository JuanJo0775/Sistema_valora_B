# Contrato — issue #76: lista de mis aportes

## `GET /v1/me/reports`

- **Seguridad:** sesión de `reportante` (también suspendida).
- **Parámetros:** `limit` (1 a 50, por defecto 20) y `before` (fecha y hora ISO 8601, opcional).
- **200:**

```json
{
  "items": [
    {
      "reportId": "uuid",
      "productName": "Arroz Diana · 500 g",
      "establishmentName": "Tienda Don José",
      "priceCop": 2500,
      "priceType": "normal",
      "observedAt": "2026-11-14T13:00:00.000Z",
      "status": "descartado",
      "appealableUntil": "2026-11-21T14:00:00.000Z"
    }
  ],
  "nextBefore": "2026-11-10T08:00:00.000Z"
}
```

- `nextBefore` solo aparece si la página está llena; se manda como `before` para pedir la siguiente.
- **400:** `limit` o `before` inválidos. **401 / 403:** sin sesión / otro rol. **Cache-Control:** `no-store`.
- `ReportReceipt` ya no se usa en esta ruta (sigue en `POST /v1/reports`).
