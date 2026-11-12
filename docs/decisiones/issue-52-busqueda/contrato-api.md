# Contrato API — issue #52: búsqueda de productos

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código. La forma de la respuesta (`{ items: Product[] }`) ya estaba en el contrato y no cambia.

## `GET /v1/products`

- **Descripción nueva:**
  - Se envía exactamente uno de `q` o `barcode`.
  - Con `q`, cada palabra debe aparecer en el nombre o en la marca, en cualquier orden y también como pedazo («gira» encuentra «girasol»), sin distinguir tildes ni mayúsculas (RF-003 RN4). Los resultados se ordenan por parecido con lo escrito y, en empate, por nombre.
  - Con `barcode`, se responde el producto que tiene esa presentación, o la lista vacía si ninguno la tiene (no 404).
- **Parámetros:** sin cambios (`q` con 2 caracteres o más, `barcode` de 8 a 14 dígitos y `limit` común).
- **200:** `Cache-Control: public, max-age=30` (valor inicial calibrable).
- **400 `VALIDATION_ERROR`**, que ya estaba en el contrato. Ahora documenta los casos:
  - sin `q` ni `barcode`: «Envía q o barcode»;
  - con los dos: «Envía solo q o barcode, no ambos»;
  - `q` de menos de 2 caracteres;
  - `barcode` que no tiene de 8 a 14 dígitos;
  - `limit` fuera de 1 a 50.

Ejemplo:

```
GET /v1/products?q=aceite%20giras%C3%B3l
200
{ "items": [ { "id": "…", "name": "Aceite de girasol", "brand": "…", "category": { "code": "grains-groceries", "name": "Granos y abarrotes" }, "presentations": [ … ] } ] }
```
