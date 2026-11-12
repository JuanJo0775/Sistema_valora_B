# Contrato API — issue #50: establishments, directorio con ubicación

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código.

## `GET /v1/establishments/nearby`

| Parámetro | Antes | Después |
|---|---|---|
| `lat` | número, requerido | número entre −90 y 90, requerido |
| `lng` | número, requerido | número entre −180 y 180, requerido |
| `radiusKm` | número, 2 por defecto | número entre 0,5 y 3, 2 por defecto (calibrable) |
| `limit` | — | el parámetro común `Limit` (1 a 50, 20 por defecto) |

Respuestas:

- **200:** `{ items: Establishment[] }`, las más cercanas primero. `items` pasa a ser requerido.
  - Cabecera `Cache-Control: no-store`. Es una excepción a la regla de caché de las lecturas públicas: la URL lleva la ubicación del usuario, y así no queda guardada en cachés intermedias ni en el navegador (EC-08).
- **400 `VALIDATION_ERROR`:** falta `lat` o `lng`, o algún parámetro está fuera de rango.
- La descripción de la ruta dice que la ubicación del usuario se usa solo para calcular la cercanía, y que no se guarda, no se registra ni aparece en la respuesta (RF-005 RN5, EC-08).

Ejemplo de respuesta 200:

```json
{
  "items": [
    {
      "id": "5b0f…",
      "name": "Tienda La Esperanza",
      "type": "barrio",
      "address": "Cra. 14 #20-30",
      "lat": 4.5339,
      "lng": -75.6811,
      "distanceM": 240
    }
  ]
}
```

## Esquema `Establishment`

| Campo | Antes | Después |
|---|---|---|
| `type` | `barrio`, `minimercado`, `supermercado` | Agrega `descuento` (grill, pregunta 1). |
| `address` | — | Nuevo, opcional (pregunta 2). |
| `lat`, `lng` | — | Nuevos, requeridos: ubicación de la tienda (grill común, pregunta 3). |
| `distanceM` | opcional | Se mantiene; en esta ruta siempre viene (metros enteros desde el punto consultado). |
| `hasVerifiedProfile` | opcional | **Se quita** hasta el módulo comercial (pregunta 5). |

Requeridos: `id`, `name`, `type`, `lat` y `lng`.

`ComparisonItem` también usa `Establishment`, así que recibe estos cambios. La comparación se construye en el paso 6 (#15).
