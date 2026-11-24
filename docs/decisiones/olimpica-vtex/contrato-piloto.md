# Contrato del piloto interno de Olímpica con VTEX

## Necesidad y permisos

El operador del backend valida entre 5 y 10 presentaciones para una zona de entrega de Armenia. No hay pantalla consumidora durante el piloto. El permiso consiste en acceso al entorno operativo del backend y a su base de datos. Ningún rol de la aplicación invoca el importador por HTTP.

El piloto cubre trazabilidad y separación de fuentes (EC-05 y EC-06), expiración de las observaciones (EC-02) y privacidad (EC-08). Los precios por tienda física conservan las reglas de los ADR-008 y ADR-009. La zona se configura con datos de prueba y no depende de la ubicación de un usuario (ADR-013).

## Entrada operativa propuesta

- Comando: `pnpm olympica:vtex` para vista previa y `pnpm olympica:vtex --apply` para persistir observaciones. En modo aplicación se devuelve un UUID de ejecución. Para reintentar la misma ejecución, usar `--apply --run-id=<UUID>`.
- Configuración del entorno: código interno de zona, municipio Armenia, contexto de entrega VTEX validado y una lista de 5 a 10 EAN únicos. Usar un código postal de prueba si el proveedor lo requiere.
- Si la configuración no es válida, terminar antes de consultar VTEX o escribir en la base. Resolver cada EAN a una presentación única y verificar la coincidencia en la respuesta de VTEX.
- Exigir que el contexto y el vendedor devueltos correspondan a la zona. Una respuesta general, ambigua o sin confirmación de zona queda omitida.

## Resultado de la ejecución

JSON con `mode` (`preview` o `apply`), `zoneId` y una fila por EAN. Cada fila incluye `ean`, `status` y, según el estado, los siguientes campos:

| Estado | Campos adicionales |
| --- | --- |
| `available` | `presentationId`, `skuId`, `sellerId`, `priceCop`, `observedAt`, `expiresAt` |
| `unavailable` | `presentationId`, `skuId`, `sellerId`, `observedAt` |
| `skipped` | `reason` en formato de código estable, como `unknown_ean`, `ambiguous_ean` o `unverified_zone` |
| `failed` | `reason` en formato de código estable, como `provider_timeout`, `invalid_response` o `persistence_error` |

En vista previa, las filas indican qué se aplicaría. En modo aplicación, una fila válida se informa como disponible o no disponible solo tras guardarla. La salida no incluye direcciones, ubicación de usuarios, credenciales ni respuestas crudas de VTEX.

## Modelo de observaciones propuesto

- Historial por fuente `olimpica_vtex`, presentación de Valora y zona. Cada observación conserva SKU, vendedor, fecha y estado. El precio es un entero positivo en COP y solo se exige para disponibilidad confirmada.
- La última observación válida determina la oferta. Una observación disponible vence 48 horas después de su fecha. Una indisponibilidad confirmada retira la oferta hasta una observación disponible posterior.
- Un error u omisión no cambia la última observación. Persistir independientemente cada fila válida y reportar los fallos. Reintentar la misma observación sin duplicarla mediante una clave estable por fuente, presentación, zona y ejecución. Una escritura tardía no debe sustituir una observación más reciente.
- La fuente, la zona y la fecha se conservan para una futura exposición. Las observaciones no se guardan como precios oficiales ni reportes comunitarios.

## OpenAPI y pruebas

El piloto es un comando interno, por lo que no agrega rutas, DTO HTTP ni cambios a `docs/openapi.yaml`. Tampoco requiere regenerar tipos del frontend. Al aprobar una pantalla pública, definir primero su ruta, campos mínimos y errores en OpenAPI. Validar el YAML y sus referencias, agregar la prueba HTTP de contrato y coordinar la regeneración de tipos, todo junto con el código de esa ruta.

Antes de implementar el comando, escribir pruebas que fallen para zona no verificada, EAN desconocido o ambiguo, vista previa sin escritura, resultados parciales, reintento, orden temporal, retiro por indisponibilidad y expiración exacta a las 48 horas. Validar la zona con evidencia de Olímpica antes de aplicar observaciones del piloto.
