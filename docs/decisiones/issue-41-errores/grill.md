# Grill — issue #41: formato de error `{ code, message }`

- **Fuentes:**
  - Issue #41 (parte 1 de #12).
  - Regla `api-rest.md`: un solo formato y el código HTTP correcto (400 datos inválidos, 401, 403, 404, 409, 422 regla de negocio, 429).
  - `docs/openapi.yaml`: esquema `Error` con `code` y `message`; ejemplo `REPORT_TOO_OLD`; respuestas 400, 401, 403, 404, 409, 422 y 429.
  - Errores del dominio existentes: `InvalidPriceError`, `InvalidQuantityError`, `IncompatibleUnitsError`, `InvalidObservationDateError` e `InvalidTtlError`, todos subclases de `DomainError`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Lo que ya estaba definido

- **Formato:** `{ "code": "...", "message": "..." }`, sin más campos.
- **Estilo de `code`:** MAYÚSCULAS_CON_GUION_BAJO en inglés, como `REPORT_TOO_OLD`.
- **Código HTTP:** 422 para una regla de negocio y 400 para datos inválidos.
- **Dependencias de `domain`:** no conoce HTTP ni NestJS. La traducción a HTTP vive fuera de `domain`.

## Preguntas

### 1. Código HTTP de los errores del dominio

- **Opciones:**
  - (a) Todos los `DomainError` responden 422, cada uno con su propio `code`.
  - (b) Algunos responden 400 (precio no entero, cantidad 0) y otros 422.
- **Recomendación:** (a).
  - Lo mal escrito (un campo que falta o un tipo equivocado) lo rechaza antes la validación de entrada con 400. Si algo llega al dominio y una regla lo rechaza, es una regla de negocio, y el contrato ya usa 422 para «precio fuera de rango».
  - El filtro queda con una sola regla y sin tabla de excepciones.
  - El `code` lo declara cada error en `domain`, sin saber de HTTP; el 422 lo decide el filtro en `shared`.
- **Decisión:** (a). Los códigos son `INVALID_PRICE`, `INVALID_QUANTITY`, `INCOMPATIBLE_UNITS`, `INVALID_OBSERVATION_DATE` e `INVALID_TTL`. Si una regla futura necesita otro estado (por ejemplo, 409), se agrega en el filtro cuando aparezca.

### 2. Validación de entrada (400)

- **Opciones:**
  - (a) Configurar ya el `ValidationPipe` global y traducir sus rechazos a `{ code: "VALIDATION_ERROR", message }` con 400.
  - (b) Dejarlo para el primer endpoint que reciba datos (paso 5).
- **Recomendación:** (a).
  - La issue #41 incluye explícitamente los errores de validación de entrada.
  - El formato queda resuelto en un solo lugar y el paso 5 no tiene que tocar `shared`.
  - No crea DTOs ni endpoints en el código real; solo la configuración global y su prueba con un controlador que existe únicamente dentro de la prueba.
- **Decisión:** (a).

### 3. `message` cuando fallan varios campos

- **Opciones:**
  - (a) Juntar todos los errores en un texto, separados por «; ».
  - (b) Mostrar solo el primero.
- **Recomendación:** (a).
  - El reportante corrige todo de una vez; reenviar varias veces cuesta tiempo y datos con poca señal (EC-01, EC-07).
  - Respeta el contrato sin agregar campos.
  - Es más fácil de depurar.
- **Decisión:** (a). Ejemplo: `"priceCop: debe ser un número entero; quantity: debe ser mayor que 0"`.
- **Idioma:** los mensajes en español se escriben en cada DTO cuando se cree (paso 5); esta issue solo los junta.

### 4. Campos que el endpoint no espera

- **Opciones:**
  - (a) Rechazarlos con 400 (`whitelist` + `forbidNonWhitelisted`).
  - (b) Ignorarlos en silencio (solo `whitelist`).
- **Recomendación:** (a).
  - Privacidad (EC-08): si el cliente empieza a enviar datos que no debe, por ejemplo la ubicación del reportante, falla de forma visible en vez de pasar inadvertido.
  - Detecta errores de integración (un campo mal escrito) con un mensaje claro.
  - Hace cumplir el contrato.
- **Decisión:** (a). Se activa también `transform`, para que el cuerpo llegue como instancia del DTO con los tipos convertidos.

### 5. Errores inesperados (500)

- **Opciones:**
  - (a) Siempre responder `{ code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado." }` y escribir el detalle (mensaje y pila) solo en el log del servidor.
  - (b) Genérico en producción, con detalle en desarrollo.
- **Recomendación:** (a).
  - La issue exige no filtrar detalles internos (EC-08). Con (b), un despliegue con `NODE_ENV` mal puesto filtraría rutas, SQL o datos.
  - El detalle sigue disponible en la consola del servidor.
  - Una sola regla, sin ramas por entorno.
- **Decisión:** (a). El log usa el `Logger` de NestJS, sin dependencias nuevas, y nunca registra el cuerpo de la petición.

### 6. Errores HTTP del framework (401, 403, 404, 409, 429)

- **Opciones:**
  - (a) Un `code` fijo por estado y un mensaje en español, tomado de las descripciones de `openapi.yaml`.
  - (b) El mensaje que genera NestJS (en inglés, con detalles de la ruta) envuelto en `{ code, message }`.
- **Recomendación:** (a).
  - Coherente con el contrato.
  - Comprensible para el usuario y sin exponer rutas internas.
  - El frontend decide por un `code` estable.
- **Decisión:** (a).

  | Estado | `code` | `message` |
  |---|---|---|
  | 401 | `UNAUTHORIZED` | Se requiere sesión. |
  | 403 | `FORBIDDEN` | El rol no tiene permiso. |
  | 404 | `NOT_FOUND` | Recurso no encontrado. |
  | 409 | `CONFLICT` | El mensaje de quien lo lanza o, si no tiene, «Conflicto con el estado actual.» |
  | 429 | `TOO_MANY_REQUESTS` | Límite de frecuencia superado. |

## Resumen

| Origen | Estado | `code` | `message` |
|---|---|---|---|
| Regla del dominio (`DomainError`) | 422 | el del error (`INVALID_PRICE`, `INVALID_QUANTITY`, `INCOMPATIBLE_UNITS`, `INVALID_OBSERVATION_DATE`, `INVALID_TTL`) | el del error, en español |
| Validación de entrada (DTO) o campo no permitido | 400 | `VALIDATION_ERROR` | todos los errores, como `campo: mensaje`, separados por «; » |
| Errores HTTP del framework | 401, 403, 404, 409, 429 | según la tabla de la pregunta 6 | en español |
| Error inesperado | 500 | `INTERNAL_ERROR` | «Ocurrió un error inesperado.» (el detalle va solo al log) |
