# Privacidad de la API y la base de datos (EC-08)

- **Requisitos:** EC-08, RNF-007, PR-15, Ley 1581 de 2012.
- **Issue:** #36. Fecha: 15 de noviembre de 2026.
- **Cómo se reproduce:** `corepack pnpm exec jest test/integration/privacy-schema.spec.ts test/integration/privacy-public-responses.spec.ts --runInBand`.

## Resultado

| Criterio de la #36 | Resultado | Evidencia |
|---|---|---|
| 0 datos personales en respuestas públicas | Cumple | `privacy-public-responses.spec.ts` |
| 0 coordenadas de usuarios guardadas | Cumple | `privacy-schema.spec.ts`; `comparison-http.spec.ts` y `establishments-http.spec.ts` («la ubicación consultada no aparece en la respuesta ni en el log, y no se guarda») |
| Datos del reportante en un esquema separado (PR-15) | Cumple, con una referencia interna documentada | `privacy-schema.spec.ts`; hallazgo 1 |

## Qué datos personales guarda Valora y dónde

| Dato | Dónde | Para qué |
|---|---|---|
| Correo | `identity.accounts.email` | Iniciar sesión. |
| Hash de la contraseña (argon2id) | `identity.accounts.password_hash` | Iniciar sesión; nunca la contraseña. |
| Versión y fecha de la política aceptada | `identity.accounts` | Consentimiento (Ley 1581). |
| Sesiones (hash del token) | `identity.sessions` | Sesión de servidor; no guarda IP ni navegador. |
| Clave seudónima del reportante (HMAC del id de la cuenta) | `identity.accounts.reporter_key`; en `reliability` como `reporter_key`, `flagger_key` y `moderator_key` | Reputación, moderación y suspensión sin identificar a la persona (#31, #32, #33). |
| Id de la cuenta que reportó | `pricing.reports.reporter_id` | Idempotencia, duplicados y ráfagas (#14, #29). Ver hallazgo 1. |
| Cambios de rol | `identity.role_changes` (ids, sin correo) | Bitácora inmutable (#73). |

**Ubicación:** la única columna geográfica es `establishments.establishments.location`, la ubicación pública de la tienda. La ubicación del usuario solo viaja como parámetro de la consulta (`/nearby` y la comparación) y no se guarda.

## Qué expone cada ruta pública

| Ruta | Datos de personas que expone |
|---|---|
| `GET /v1/health` | Ninguno. |
| `GET /v1/products`, `GET /v1/products/{productId}` | Ninguno (solo catálogo). |
| `GET /v1/products/{productId}/comparison` | Ninguno. Lleva `reportId` del precio, sin autor. `no-store` porque la URL lleva la ubicación. |
| `GET /v1/establishments/nearby` | Ninguno. `no-store` por la misma razón. |
| `GET /v1/establishments/{establishmentId}/prices` | Ninguno. Lleva `reportId`, sin autor. |
| `POST /v1/auth/register`, `POST /v1/auth/login` | No dicen si un correo existe (#16). |

Las rutas con sesión tampoco devuelven el correo: `GET /v1/auth/session` da el rol y el token CSRF; la cola de moderación y el estado de un aporte no dicen quién reportó, quién marcó ni quién decidió (#32, #71, #76). Los eventos internos llevan solo la clave seudónima (#31, #33, #29).

## Qué guardan los registros

- No hay registro de peticiones: ni la URL (con la ubicación) ni la IP se escriben.
- Se registran los errores inesperados con su traza (filtro de errores y repartidor del outbox), sin el cuerpo de la petición.
- Los comandos del administrador escriben en su consola: `pnpm db:seed` (filas del CSV) e `identity:set-role`, que muestra el correo de la cuenta cambiada. Es la consola de quien administra el servidor, no un registro público.

## Hallazgos

1. **`pricing.reports.reporter_id` guarda el id de la cuenta fuera de `identity`.** Es un UUID sin correo ni nombre, que `pricing` usa para la idempotencia, el duplicado y la ráfaga. Nunca sale en respuestas ni eventos (lo verifican `privacy-public-responses.spec.ts`, `reports-http.spec.ts` y las pruebas de punta a punta). Se deja así (grill de la #36, pregunta 1). Cambiarlo por la clave seudónima pediría una migración que recalcule claves con el secreto.
2. **`identity:set-role` muestra el correo en la consola del administrador.** Es intencional: confirma a quién se le cambió el rol.

## Pruebas guardianas

- `privacy-schema.spec.ts` falla si una migración agrega correo o contraseña fuera de `identity`, una columna de coordenadas fuera de la tienda, una columna de IP o una referencia a la cuenta fuera de `identity` y `pricing.reports`.
- `privacy-public-responses.spec.ts` recorre las rutas públicas con una cuenta que reportó y otra que marcó, y falla si alguna respuesta trae su correo, su id, su clave seudónima o la ubicación consultada. Una ruta pública nueva debe agregarse a esa lista.
