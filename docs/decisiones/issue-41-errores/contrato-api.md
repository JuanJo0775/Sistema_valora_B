# Contrato API — issue #41: formato de error

No se agregan rutas. Se documenta en `docs/openapi.yaml` lo que el filtro global garantiza para todas las rutas.

## Cambios en `docs/openapi.yaml`

| Lugar | Cambio | Razón |
|---|---|---|
| `components.schemas.Error` | Se agrega una descripción con el catálogo de `code`: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR` y los de las reglas del dominio. Se indica que solo existen `code` y `message`. | El frontend sabe qué `code` puede recibir y que no habrá más campos. |
| `components.responses.BadRequest` | La descripción pasa a decir que responde con `code: VALIDATION_ERROR` y los errores de cada campo en `message`, separados por «; ». | Grill, preguntas 2 a 4. |
| `components.responses.UnprocessableEntity` (nuevo) | 422 «Regla de negocio incumplida», con el esquema `Error`. | Grill, pregunta 1. Las rutas que hoy declaran 422 en línea pueden reutilizarla. |
| `components.responses.InternalServerError` (nuevo) | 500 «Error inesperado», con `code: INTERNAL_ERROR` y un mensaje genérico. | Grill, pregunta 5. |

## Lo que no cambia

- La forma del error: sigue siendo `{ code, message }`.
- Las rutas existentes: no se tocan sus respuestas en esta issue. Referenciar 422 y 500 en cada ruta se hará al implementar cada una (pasos 4 a 7), o antes de la prueba de contrato (#25), para no tocar ahora rutas que todavía no existen en el código.
