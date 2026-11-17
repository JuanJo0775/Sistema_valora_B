# Contrato de API

## Fuente de verdad

El contrato OpenAPI 3.x de la API se mantendrá en:

`docs/openapi.yaml`

La primera versión del archivo se incorporará al cerrar el inventario de endpoints y los modelos de solicitud/respuesta de cada módulo. No se copia ni se adopta como contrato oficial una especificación externa o un borrador anterior sin reconciliarlo con los requisitos vigentes de Notion.

## Convenciones aprobadas

- REST sobre HTTPS.
- JSON.
- Prefijo de versión `/v1`.
- Dos superficies lógicas: consumidor/reportante y portal de comercios.
- Autorización diferenciada por operación y rol.
- Idempotencia en el registro de reportes.
- Errores documentados con un formato uniforme.
- Las respuestas públicas no exponen identidad ni ubicación personal del reportante.
- La comparación declara su criterio de orden y excluye atributos comerciales del algoritmo.

## Criterios para aceptar cambios

- Cada operación referencia requisito funcional.
- Request, response, errores y seguridad definidos.
- No se publican campos personales no aprobados.
- Los cambios incompatibles se versionan o migran de forma explícita.
- Las pruebas de contrato validan la implementación frente al YAML.

**Estado:** contrato aún no incorporado; este documento define su ubicación y reglas, no afirma que la API exista.
