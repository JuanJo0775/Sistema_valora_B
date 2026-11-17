# Contrato API — issue #49: catalog, productos y presentaciones

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código.

## `GET /v1/products/{productId}`

- **200:** el producto con su categoría y sus presentaciones.
  - Cabecera nueva `Cache-Control: public, max-age=300` (grill, pregunta 7). Express agrega `ETag` y responde 304 si no cambió.
- **400 `VALIDATION_ERROR`:** `productId` no es un UUID.
- **404 `NOT_FOUND`:** no existe un producto con ese id. La respuesta 404 ya estaba en el contrato.

Ejemplo de respuesta 200:

```json
{
  "id": "3f1c…",
  "name": "Arroz blanco",
  "brand": "Diana",
  "category": { "code": "grains-groceries", "name": "Granos y abarrotes" },
  "presentations": [
    { "id": "9a2e…", "barcode": "7702511000014", "quantity": 1, "unit": "kg", "packCount": 1 },
    { "id": "b71d…", "quantity": 500, "unit": "g", "packCount": 1 }
  ]
}
```

## Esquemas

| Esquema | Antes | Después |
|---|---|---|
| `BaseUnit` | `enum: [g, ml, und]` | Se renombra a **`Unit`**: `enum: [g, kg, ml, l, und]` (unidad tal como se escribe; la unidad base la calcula `domain`). |
| `Presentation` | `id`, `barcode`, `quantity`, `unit` | Agrega **`packCount`** (entero ≥ 1, siempre presente; 1 si no es un empaque). |
| `Product` | `category` como texto libre; requeridos `id`, `name` | `category` pasa a **`Category`**; agrega **`brand`** opcional; requeridos `id`, `name`, `category` y `presentations`. |
| `Category` | — | Nuevo: `{ code, name }`, ambos requeridos. |

`POST /product-requests` también usa la unidad (`unit`), así que acepta los 5 valores al cambiar el esquema. Su forma no cambia más en este pull request.

## Fuera de este cambio

- `GET /products` (búsqueda): issue #52.
- Agregar `brand` a `POST /product-requests` (RF-003 la pide): se hace con la issue de solicitudes de producto.
