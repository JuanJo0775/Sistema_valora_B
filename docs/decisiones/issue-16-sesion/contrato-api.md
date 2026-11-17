# Contrato API — issue #16: sesión, CSRF y roles

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código. Cada cambio cita la pregunta del grill que lo decide.

## Primer pull request: cuentas y sesión

### `POST /auth/register`

| Parte | Antes | Después |
|---|---|---|
| `email` | `format: email` | Agrega `maxLength: 254`; se guarda sin espacios y en minúsculas (pregunta 7). |
| `password` | `minLength: 10` | Agrega `maxLength: 128` (pregunta 7). |
| `acceptedPolicyVersion` | Texto libre | Debe ser la versión vigente (`2026-11`, provisional); otra responde 400 (pregunta 7). |
| 201 | Cuenta creada | Aclara: también responde 201 si el correo ya tiene cuenta, sin cambiar nada (pregunta 6). La cuenta nueva siempre es `reportante` (pregunta 5). No inicia sesión. |
| 400 | `BadRequest` | Sin cambios. |
| 429 | `TooManyRequests` | 10 registros por IP en 15 minutos, con `Retry-After` (pregunta 10). |

### `POST /auth/login`

| Parte | Antes | Después |
|---|---|---|
| 204 | `Set-Cookie` HttpOnly, Secure, SameSite | Detalla: `valora_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 días; cada inicio crea una sesión nueva (preguntas 3 y 9). |
| 400 | No estaba | `BadRequest`. |
| 401 | `Unauthorized` | Siempre «Correo o contraseña incorrectos.», exista o no la cuenta (pregunta 6). |
| 429 | `TooManyRequests` | 5 fallos por correo y 20 intentos por IP en 15 minutos, con `Retry-After` (pregunta 10). |

### `POST /auth/logout`

| Parte | Antes | Después |
|---|---|---|
| 204 | Sesión cerrada | Revoca la sesión en el servidor y borra la cookie (pregunta 3). |
| 401 | No estaba | `Unauthorized`: sin sesión activa. |
| 403 | No estaba | `Forbidden` con code `CSRF_TOKEN_INVALID` (pregunta 4). |

### `GET /auth/session`

| Parte | Antes | Después |
|---|---|---|
| 200 | `role` requerido; `csrfToken` opcional | `role` y `csrfToken` requeridos. El token se guarda en memoria en el frontend y va en `X-CSRF-Token` (pregunta 4). |
| 401 | `Unauthorized` | Sin sesión, vencida (7 días sin uso o 30 desde el inicio) o revocada (pregunta 3). |

No devuelve el correo ni el id de la cuenta (EC-08): el frontend solo necesita el rol.

### Respuestas comunes

| Respuesta | Antes | Después |
|---|---|---|
| `Unauthorized` | Se requiere sesión | Sin cambios (code `UNAUTHORIZED`). |
| `Forbidden` | El rol no tiene permiso | Dos códigos: `FORBIDDEN` (rol no permitido) y `CSRF_TOKEN_INVALID` (falta `X-CSRF-Token` o no coincide). |
| `TooManyRequests` | Límite de frecuencia superado | Agrega la cabecera `Retry-After` (segundos). |

### Esquemas de seguridad

- `sessionCookie`: la descripción detalla los atributos de la cookie y el ciclo de vida.
- `csrfToken`: la descripción dice que lo entrega `GET /auth/session` y que lo exigen las rutas con sesión y método `POST`, `PUT`, `PATCH` o `DELETE`.

## Segundo pull request: proteger `POST /reports`

| Parte | Antes | Después |
|---|---|---|
| Descripción | «Hasta la issue #16 la ruta no exige sesión» | Exige sesión de `reportante` y `X-CSRF-Token` (preguntas 4 y 5). |
| 401 | «Desde la #16» | Sin la nota. |
| 403 | No estaba | `Forbidden`: `FORBIDDEN` si el rol no es `reportante`; `CSRF_TOKEN_INVALID`. |

La comparación (`GET /products/{productId}/comparison`) sigue con `security: []`.
