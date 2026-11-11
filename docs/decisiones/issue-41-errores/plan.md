# Plan — issue #41: formato de error `{ code, message }`

- **Objetivo:** que toda respuesta de error de la API tenga la forma `{ code, message }`, con el estado HTTP correcto, según las decisiones de `grill.md`.
- **Relación:** issue padre #12, épica #9, regla `api-rest.md`, EC-08.
- **Fuera de alcance:**
  - DTOs y endpoints reales.
  - Mensajes de validación en español de cada DTO (paso 5).
  - Referenciar 422 y 500 en cada ruta del contrato.

## Rama y pull request

`feat/shared-errores`, que sale de `dev`. Un pull request hacia `dev` con `Closes #41`.

## Diseño

- **`src/domain/domain-error.ts`:** `DomainError` declara un `code` abstracto (texto, sin HTTP). Cada error del dominio define el suyo: `INVALID_PRICE`, `INVALID_QUANTITY`, `INCOMPATIBLE_UNITS`, `INVALID_OBSERVATION_DATE` e `INVALID_TTL`.
- **`src/shared/http/error.filter.ts`:** un `ExceptionFilter` global que decide qué responder:
  - `DomainError` → 422 con su `code` y su mensaje.
  - Rechazo del `ValidationPipe` → 400 `VALIDATION_ERROR`, con `campo: mensaje` separados por «; ». El campo no permitido sale como «no está permitido».
  - JSON mal formado (el cuerpo no se puede leer) → 400 `VALIDATION_ERROR` con «El cuerpo de la solicitud no es JSON válido.»
  - 401, 403, 404, 409 y 429 → la tabla del grill (pregunta 6).
  - Cualquier otro estado 4xx no previsto → `code: REQUEST_ERROR` y «La solicitud no se pudo procesar.», con el mismo estado.
  - Cualquier otra cosa → 500 `INTERNAL_ERROR` con el mensaje genérico, y el detalle va al `Logger` de NestJS, sin el cuerpo de la petición.
- **`src/shared/http/validation.ts`:** la configuración del `ValidationPipe` (`whitelist`, `forbidNonWhitelisted` y `transform`), con una `exceptionFactory` que arma los mensajes.
- **`src/app.setup.ts`:** `configureApp` registra el pipe y el filtro globales. Así `main.ts` y las pruebas usan la misma configuración.
- **Reglas de dependencia:** `shared` puede importar `domain`; `domain` no importa nada. `depcheck` lo sigue verificando.

## Pasos (TDD por la interfaz pública: peticiones HTTP con Supertest)

Prueba de integración en `test/integration/errors.spec.ts`, con un controlador que solo existe dentro de la prueba y lanza cada tipo de error. Cada ciclo es un commit `test(shared)` (rojo) y otro `feat(shared)` (verde), más un `refactor` si hace falta.

1. Una regla del dominio incumplida (`InvalidQuantityError`) → 422 `{ code: "INVALID_QUANTITY", message }`.
2. Cada error del dominio expone su `code` (los 5).
3. Ruta inexistente → 404 `{ code: "NOT_FOUND", message: "Recurso no encontrado." }`.
4. 401, 403, 409 (con y sin mensaje propio) y 429 → la tabla del grill.
5. Un DTO con dos campos inválidos → 400 `VALIDATION_ERROR`, con los dos errores separados por «; ».
6. Un campo no declarado → 400 `VALIDATION_ERROR` con «campo: no está permitido».
7. JSON mal formado → 400 `VALIDATION_ERROR`.
8. Error inesperado → 500 `INTERNAL_ERROR` con el mensaje genérico; la respuesta no contiene el mensaje interno.
9. Otro 4xx no previsto (por ejemplo, 405) → `REQUEST_ERROR` con el mismo estado.

Después:

10. **Contrato:** aplicar `contrato-api.md` en `docs/openapi.yaml`. Commit `docs(api)`.
11. **Registro:** esta carpeta. Commit `docs(decisiones)`.

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- `GET /v1/health` sigue respondiendo `{ "status": "ok" }`.
- El ciclo rojo → verde visible en los commits.

## Dos detalles que el grill no cubrió (incluidos en este plan para tu aprobación)

- **JSON mal formado** → 400 `VALIDATION_ERROR`, porque son datos inválidos.
- **Otros 4xx no previstos** → `REQUEST_ERROR` con un mensaje genérico en español, para no dejar ningún error fuera del formato.

## Notion

- **[EPIC-B00]:** agregar las filas 3a, 3b y 3c (#41, #42 y #43), con el estado de cada una.
