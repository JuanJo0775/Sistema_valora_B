# Contrato API — issue #51: semilla

**Sin cambios en `docs/openapi.yaml`.** La semilla es un comando (`pnpm db:seed`), no una ruta HTTP.

- Los productos y las tiendas sembrados se leen con las rutas que ya existen: `GET /v1/products/{productId}`, `GET /v1/products` y `GET /v1/establishments/nearby`.
- El parámetro `barcode` del contrato ya acepta de 8 a 14 dígitos. La validación del dígito de control (grill, pregunta 6) se aplica a los códigos que **entran** al catálogo (semilla y, más adelante, solicitudes de producto). La búsqueda no la exige: un código mal escrito simplemente no encuentra nada.
