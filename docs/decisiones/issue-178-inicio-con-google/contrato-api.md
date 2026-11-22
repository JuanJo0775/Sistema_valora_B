# Contrato API: inicio de sesión con Google (épica #178)

Borrador de los cambios en `docs/openapi.yaml`. Cada cambio entra en `openapi.yaml` en el mismo pull request que su código: la eliminación en #179 y las rutas de Google en #181 (con `/api-contract-authoring`).

## #179: `POST /v1/me/account-deletion`

El cuerpo acepta **exactamente uno** de estos dos campos:

| Campo | Para quién | Error si no coincide |
|---|---|---|
| `password` (como hoy) | Cuentas con contraseña | 403 `INVALID_PASSWORD` (sin cambios) |
| `confirmEmail` (nuevo) | Cuentas sin contraseña (creadas con Google) | 403 `INVALID_CONFIRMATION`: «El correo no coincide con el de la cuenta.» |

- Ninguno de los dos, o los dos a la vez: 400 `VALIDATION_ERROR`.
- Una cuenta con contraseña que envía `confirmEmail`: 403 `INVALID_PASSWORD` (debe usar su contraseña).
- El correo se compara sin espacios y en minúsculas.
- Límites (5 fallos por cuenta y 20 intentos por IP en 15 minutos), 202, 401 y 429: sin cambios.

## #179: `POST /v1/auth/login` y `POST /v1/auth/restore-account`

Sin cambios de forma. La descripción aclara que una cuenta creada con Google no tiene contraseña y recibe el mismo 401 genérico (EC-08: no revela cómo se creó la cuenta).

## #181: rutas nuevas (borrador)

### `GET /v1/auth/google/start`

- Sin sesión. Responde **302** a `accounts.google.com` con `response_type=code`, `scope=openid email profile`, `state`, `nonce`, `code_challenge` (S256) y `redirect_uri` = `GOOGLE_REDIRECT_URI`.
- Guarda `state`, `nonce` y `code_verifier` en la cookie `valora_google` (HttpOnly, Secure, SameSite=Lax, Path=/v1/auth/google, Max-Age 10 minutos, firmada con `SESSION_SECRET`).
- 404 `NOT_FOUND` si faltan las variables de Google.
- 429 con el límite por IP de los inicios de sesión.

### `GET /v1/auth/google/callback?code=…&state=…`

Siempre responde **302** a la PWA (la persona llega por el navegador, no por `fetch`) y borra `valora_google`:

| Caso | Redirección |
|---|---|
| Cuenta existente o vinculada | `/` con la cookie `valora_session` (igual que `POST /auth/login`) |
| Correo nuevo | `/bienvenida`, con la cookie `valora_google_signup` (10 minutos, firmada) que guarda `sub`, correo y nombre propuesto |
| `state` ausente o distinto, código inválido, `id_token` inválido | `/entrar?error=google` |
| `email_verified` falso | `/entrar?error=google-correo-sin-verificar` |
| Cuenta suspendida | `/entrar?error=cuenta-suspendida` |
| Eliminación pendiente (ADR-032) | `/entrar?error=eliminacion-pendiente` |
| La persona canceló en Google (`error=access_denied`) | `/entrar` |

Nunca lleva el correo ni el `sub` en la URL (EC-08).

### `POST /v1/auth/google/complete`

- Exige la cookie `valora_google_signup` vigente; si falta o venció, 401 `UNAUTHORIZED`.
- Cuerpo: `{ "displayName": "…", "acceptedPolicyVersion": "2026-11" }`, con las mismas reglas que `POST /auth/register`.
- **204** con `valora_session`: crea la cuenta `reportante` con el correo verificado, sin contraseña y con `google_subject`; borra `valora_google_signup`.
- 400 `VALIDATION_ERROR`; 429 con el límite de registros por IP.
- Si mientras tanto alguien creó una cuenta con ese correo, se vincula a ella (misma regla del caso de uso).

### `GET /v1/auth/session`

Sin cambios de forma. `emailVerified` sale `true` en las cuentas que entraron con Google.
