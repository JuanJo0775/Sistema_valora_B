# Plan: inicio de sesión con Google (épica #178, fase 2 de ADR-029)

**Objetivo:** que cualquier persona entre a Valora con su cuenta de Google y quede con la misma sesión de cookie y CSRF de siempre (ADR-014).
**RF / EC / ADR:** RF-001, RF-002 · EC-03, EC-08, EC-05 · ADR-014, ADR-029, ADR-032.
**Fuera de alcance:** que una cuenta creada con Google ponga una contraseña después; otros proveedores (Apple, Facebook); exigir el correo verificado para iniciar sesión.
**Aprobado:** por el equipo el 20-nov-2026, con las recomendaciones de `grill.md`.

Ya listo fuera del código (20-nov-2026): dominio `https://www.valoora.app` verificado en Google Search Console, pantalla de consentimiento publicada y cliente OAuth con la redirección `https://www.valoora.app/v1/auth/google/callback` (ver `docs/despliegue.md`, paso 5 bis).

## Pasos (cada uno es una rama y un pull request)

| # | Issue | Rama | Entrega | TDD |
|---|---|---|---|---|
| 1 | #179 | `feat/identity-cuentas-sin-contrasena` | `password_hash` acepta nulo; login y restauración responden el 401 genérico con una cuenta sin contraseña; eliminar la cuenta sin contraseña se confirma escribiendo el correo | Sí |
| 2 | #180 | `feat/identity-entrar-con-google` | Columna `google_subject` y caso de uso `SignInWithGoogle` (vincular, entrar o pedir la política), sin HTTP | Sí |
| 3A | #181 | `feat/identity-google-oidc` | Piezas sin HTTP: configuración de Google, cookie firmada del saludo (`state`, `nonce`, PKCE) y adaptador `jose` v5 + `fetch` | Sí |
| 3B | #181 | `feat/identity-rutas-google` | Contrato primero; `GET /v1/auth/google/start`, `GET /v1/auth/google/callback`, `POST /v1/auth/google/complete` y el caso de uso `CompleteGoogleSignUp` | Sí |
| 4 | F#154 | `feat/auth-boton-google` | Botón «Continuar con Google», página `/bienvenida` y mensajes de error | Vitest y Playwright |
| 5 | #182 | `chore/google-produccion` | Variables en Render y prueba real en `www.valoora.app` | No (operación) |

Orden: 1 → 2 → 3 → (4 y 5). El paso 4 empieza cuando el contrato del paso 3 esté en `dev`.

## Paso 1 (#179): ciclos TDD

`google_subject` se agrega en el paso 2, que es el primero que la usa (YAGNI).

| Ciclo | Comportamiento (en lenguaje del dominio) | Dónde | Rojo esperado |
|---|---|---|---|
| 1 | Con una cuenta sin contraseña, iniciar sesión responde «Correo o contraseña incorrectos» y cuenta como fallo | `login.spec.ts` | La cuenta de prueba con `passwordHash: null` no compila |
| 2 | Con una cuenta sin contraseña, restaurar la cuenta responde el mismo error genérico | `restore-account.spec.ts` | Igual que el ciclo 1 |
| 3 | Una cuenta sin contraseña pide la eliminación escribiendo su correo y queda pendiente 10 días | `delete-own-account.spec.ts` | El caso de uso no acepta la confirmación por correo |
| 4 | Con un correo que no es el de la cuenta, la eliminación se rechaza y cuenta como fallo | `delete-own-account.spec.ts` | Se programa la eliminación |
| 5a | Una cuenta con contraseña no puede confirmar con el correo: sigue pidiendo la contraseña | `delete-own-account.spec.ts` | Se programa la eliminación |
| 5b | Una cuenta sin contraseña que envía una contraseña recibe `INVALID_PASSWORD` sin verificar ningún hash | `delete-own-account.spec.ts` | Se verifica contra un hash vacío (con argon2 sería un 500) |
| 6 | La base guarda y devuelve cuentas sin contraseña (migración y repositorios) | `test/integration/identity-repositories.spec.ts` | `password_hash` es `NOT NULL` |
| 7 | `POST /v1/me/account-deletion` acepta `confirmEmail` en lugar de `password` (exactamente uno de los dos) y lo refleja el contrato | `test/integration/account-deletion-http.spec.ts` y `docs/openapi.yaml` | 400 con `confirmEmail` |

**Cómo resultó (20-nov-2026):** el ciclo 2 pasó en verde desde el principio (el cambio de tipo del ciclo 1 ya cubría la restauración) y quedó como prueba de caracterización. El ciclo 3 cambió el puerto `passwordHashOf` por `credentialsOf` (correo y hash), porque `null` ya no distinguía «no existe» de «no tiene contraseña». Tras el 5b hubo una refactorización real: un solo método decide cómo se confirma la eliminación. En el ciclo 7, la prueba de «los dos campos a la vez» ya respondía 400 y quedó como guardia.

**Terminado cuando:** las pruebas de inicio de sesión, restauración y eliminación pasan con cuentas sin contraseña; la prueba guardiana del esquema (`privacy-schema.spec.ts`) sigue en verde; `pnpm test`, `lint`, `typecheck` y `depcheck` en verde.

## Paso 2 (#180): ciclos TDD

Puerto propio `GoogleAccountLinks` (`findBySubject`, `findByEmail`, `link`) en lugar de ensanchar `AccountRepository`, para no tocar los dobles de las demás pruebas.

| Ciclo | Comportamiento | Rojo |
|---|---|---|
| 1 | Si Google no verificó el correo, se rechaza sin tocar ninguna cuenta | No existía el caso de uso |
| 2 | Una cuenta ya vinculada a ese `sub` entra y abre la misma sesión que el login | No devolvía sesión |
| 3 | Un correo sin cuenta responde `needs-policy` (correo normalizado y nombre de Google) y no crea nada | Llegaba a «aún no implementado» |
| 4 | Un correo con cuenta verificada se vincula, conserva la contraseña y abre sesión | Respondía `needs-policy` |
| 5 | Un correo con cuenta sin verificar se vincula con `forgetPassword` (pierde contraseña y sesiones) | Vinculaba sin olvidar la contraseña |
| 6 | Una cuenta suspendida entra igual que con el login | Caracterización: pasó en verde de entrada |
| 7 | Con eliminación pendiente (por `sub` o por correo) no abre sesión, no se vincula y dice cuándo se borra | Abría la sesión |
| 8 | Migración `0031` (`google_subject` única) y `DrizzleGoogleAccountLinks`: vincular, borrar la contraseña y cerrar sesiones en una transacción | No existía el repositorio |

El repositorio aún no se registra en `identity.module.ts`: lo hará la #181, que es la primera ruta que lo usa (YAGNI).

## Paso 3 (#181): ciclos TDD, partido en dos PR

Aprobado por el equipo el 20-nov-2026, para que cada PR quede por debajo de unas 400 líneas.

**PR A (`feat/identity-google-oidc`), sin HTTP ni contrato:**

| Ciclo | Comportamiento |
|---|---|
| 0 | Documentación: la librería pasa a `jose` v5 + `fetch` (grill, pregunta 1; ADR-029) |
| 1 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` van las tres o ninguna; si falta una, la API no arranca |
| 2 | La cookie del saludo guarda `state`, `nonce` y el verificador PKCE firmados con `SESSION_SECRET`; alterada, se rechaza |
| 3 | La cookie del saludo vence a los 10 minutos |
| 4 | El adaptador arma la URL de Google con `code_challenge` S256, `state`, `nonce` y `openid email profile` |
| 5 | El adaptador cambia el código por el `id_token` y lo valida (firma, `aud`, `iss`, `exp`); un `aud` ajeno se rechaza |
| 6 | Un `nonce` distinto al de la cookie se rechaza |

**PR B (`feat/identity-rutas-google`):** contrato primero, luego `start`, `callback`, `CompleteGoogleSignUp` y `complete` (ver `contrato-api.md`).

## Riesgos y decisiones abiertas

- **Robo de cuenta por registro previo.** Alguien registra con contraseña el correo de otra persona y no lo verifica; si esa persona entra luego con Google, se vincularía a una cuenta cuya contraseña conoce el atacante. Mitigación del paso 2: al vincular una cuenta **sin verificar**, se borra su contraseña y se cierran sus sesiones.
- **Client secret.** El cliente OAuth tiene un secreto que termina en `…92dB`; Google ya no lo muestra. Si nadie lo guardó, se crea uno nuevo antes del paso 3 y se guarda solo en Render.
- **Reenvío de Vercel.** La redirección de Google llega a `www.valoora.app/v1/...` y Vercel la reenvía a Render. `TRUST_PROXY` ya lo cubre; el paso 5 lo prueba de punta a punta.

## Reparto sugerido

Pasos 1 y 2 en orden (el 2 usa el tipo de cuenta del 1). Paso 3: quien lleva el backend. Paso 4: quien lleva el frontend. Paso 5: quien administra Render y Google Cloud.
