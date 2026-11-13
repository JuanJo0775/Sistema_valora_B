# Plan — issue #16: sesión, CSRF y roles

- **Objetivo:** cuentas de reportante con consentimiento, sesión de servidor con cookie, CSRF, roles y límites de frecuencia (ADR-014), y después `POST /v1/reports` protegido.
- **Relación:** paso 7 del H2-01, épica #1. RF-001, RF-002, ADR-001, ADR-014, EC-08.
- **Decisiones:** `grill.md` (11 preguntas). Cambios del contrato: `contrato-api.md`.
- **Dos pull requests** (pregunta 1). La #16 se cierra con el segundo; el segundo resuelve la #62.
- **Fuera de alcance:**
  - Moderador y comercio desde la API, bloqueo de cuentas y cambio de rol.
  - Verificación de correo y recuperación de contraseña.
  - CORS y `trust proxy` (con el despliegue, ADR-012).
  - Limpieza de sesiones vencidas.

## Primer pull request: cuentas y sesión

- **Rama:** `feat/identity-sesion` (ya creada desde `dev`). Pull request hacia `dev` con `Refs #16`.
- **Dependencias nuevas** (pregunta 11): `@node-rs/argon2` y `cookie`. Se comprueba que instalan y funcionan en Windows y en la CI.

### Diseño

#### `src/domain/` (TDD)

- **`session-lifetime.ts`:**
  - `isSessionActive({ createdAt, lastSeenAt, revokedAt, now })`: activa si no está revocada, si `now − lastSeenAt` ≤ 7 días y si `now − createdAt` ≤ 30 días.
  - `needsTouch(lastSeenAt, now)`: verdadero si pasaron 5 minutos o más.
  - Constantes provisionales en el mismo archivo.

#### `identity` (módulo nuevo, con `/nuevo-modulo`)

- **`infrastructure/schema.ts`:** `pgSchema('identity')` con dos tablas.
  - `accounts`: `id`, `email` (único, normalizado), `password_hash`, `role` (`CHECK`: `reportante`, `comercio`, `moderador`), `policy_version`, `policy_accepted_at` y `created_at`.
  - `sessions`: `id`, `token_hash` (único), `account_id` (llave foránea a `accounts`, mismo esquema), `created_at`, `last_seen_at`, `expires_at` y `revoked_at`.
- **Migración:** `0009_identity`, generada con `pnpm db:generate` y revisada.
- **`application/`:**
  - **Puertos:** `AccountRepository`, `SessionRepository`, `PasswordHasher`, `AttemptLimiter` y `Clock`.
  - **Casos de uso:**
    - `RegisterAccount`: normaliza el correo, valida la versión de la política, calcula el hash siempre y crea un `reportante` solo si el correo no existe.
    - `Login`: revisa los límites y verifica la contraseña (contra un hash de relleno si la cuenta no existe). Crea una sesión con un token aleatorio de 256 bits, guarda su SHA-256 y reinicia el contador del correo.
    - `ResolveSession`: del token a la cuenta y su rol, si la sesión sigue activa; actualiza `last_seen_at` si hace falta.
    - `Logout`: marca `revoked_at`.
  - **`csrf.ts`:** `csrfTokenFor(sessionToken, secret)` y `isValidCsrfToken(...)`, con HMAC-SHA256 y `timingSafeEqual`.
- **`infrastructure/`:**
  - `DrizzleAccountRepository` y `DrizzleSessionRepository`.
  - `Argon2PasswordHasher`: 19 MiB, 2 iteraciones y 1 hilo.
  - `InMemoryAttemptLimiter`: ventana fija con el reloj como puerto.
- **`http/`:**
  - `AuthController`: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` y `GET /auth/session`.
  - La cookie se lee y escribe con `cookie` (`parse` y `serialize`) sobre tipos estructurales, sin `@types/express`.
  - `SessionGuard` con el decorador `@Roles(...)`: 401 sin sesión; 403 `FORBIDDEN` con otro rol; 403 `CSRF_TOKEN_INVALID` en `POST`, `PUT`, `PATCH` y `DELETE` sin el token correcto.
  - Se exportan en `index.ts` para que `pricing` los use en el segundo pull request.
- **`src/shared/http/error.filter.ts`:**
  - un 403 conserva su propio `code`, como ya lo hace el 409;
  - el 429 deja pasar la cabecera `Retry-After`.

### Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay una refactorización real. Una prueba que pase sin código nuevo se sube como caracterización y su commit lo dice.

**Dominio (Jest, sin base):**

1. Una sesión usada hace 6 días sigue activa; una sin uso por más de 7 días vence.
2. Una sesión vence a los 30 días del inicio aunque se use todos los días.
3. Una sesión revocada no está activa.
4. `last_seen_at` se actualiza solo si pasaron 5 minutos.

**Límites (unitarias, reloj falso):**

5. Se permiten hasta N intentos en la ventana; el siguiente se bloquea y dice cuántos segundos faltan.
6. Al empezar una ventana nueva, o al reiniciar la clave, se permite de nuevo.

**Casos de uso (dobles detrás de los puertos):**

7. El registro crea un `reportante` con el correo normalizado, el hash y el consentimiento.
8. Una versión de la política distinta de la vigente se rechaza.
9. Un correo ya registrado da el mismo resultado, no cambia la cuenta y calcula el hash igual.
10. Un inicio de sesión correcto crea una sesión nueva, guarda solo el hash del token y reinicia el contador del correo.
11. Una contraseña mala y un correo inexistente dan el mismo error, y en los dos casos se verifica un hash.
12. Al quinto fallo por correo, o al intento 21 por IP, se responde con el límite y los segundos que faltan.
13. Un token válido da la cuenta y su rol; un token vencido, revocado o desconocido no da nada.
14. Cerrar sesión la revoca.
15. El token CSRF de una sesión coincide; el de otra sesión no.

**Integración (`valora_test`):**

16. Los repositorios guardan cuentas (correo único) y sesiones, las encuentran por el hash del token y las revocan.
17. `Argon2PasswordHasher` calcula y verifica hashes con Argon2id real.

**Filtro de errores:**

18. Un 403 con su propio `code` lo conserva; un 429 conserva `Retry-After`.

**HTTP (Supertest):**

19. El registro responde 201; repetido, 201 igual; con datos inválidos o con otra versión de la política, 400.
20. El inicio de sesión responde 204 con la cookie y sus atributos; con credenciales malas, 401; al pasar el límite, 429 con `Retry-After`.
21. `GET /auth/session` responde 200 con `role` y `csrfToken`; sin cookie, 401.
22. Cerrar sesión sin `X-CSRF-Token` responde 403 `CSRF_TOKEN_INVALID`; con el token, 204, y después `GET /auth/session` responde 401.
23. **Roles:** en una ruta de prueba que solo existe en el módulo de pruebas, un `reportante` pasa, un `comercio` recibe 403 y sin sesión, 401.
24. **Privacidad (EC-08):** ninguna respuesta contiene el correo, el id de la cuenta ni el hash, y la contraseña no aparece en el log.

### Después

- `docs/openapi.yaml` según `contrato-api.md` (primera parte).
- **`docs/DECISIONS.md`:** sección de la #16, con el ciclo de vida de la sesión, CSRF, roles, límites y dependencias.
- **README:** el módulo `identity` en «Estado» y en la estructura.
- **Notion:** EPIC-B01 con el avance.

## Segundo pull request: proteger `POST /reports`

- **Rama:** `feat/pricing-reporte-con-sesion`, desde `dev` después de mezclar el primero. Pull request con `Closes #16` y `Closes #62`.
- **Cambios:**
  - `ReportsController` usa `SessionGuard` con `@Roles('reportante')` y pasa el id de la cuenta a `RegisterReport`, que lo guarda en `reporter_id`.
  - Migración con `CHECK (reporter_id IS NOT NULL) NOT VALID` (pregunta 8).
  - `openapi.yaml` según la segunda parte de `contrato-api.md`.
- **Ciclos:**
  1. Sin sesión, 401.
  2. Con sesión de `comercio`, 403.
  3. Sin `X-CSRF-Token`, 403 `CSRF_TOKEN_INVALID`.
  4. Con sesión de `reportante`, 201, y el reporte guarda el id de la cuenta.
  5. La migración rechaza un reporte nuevo sin reportante y deja los anteriores.
  6. La comparación sigue respondiendo sin sesión.
  7. El evento `PriceReported` sigue sin datos del reportante.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde, con `src/domain` al 80 % o más de líneas.
