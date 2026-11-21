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
| 3 | #181 | `feat/identity-rutas-google` | `GET /v1/auth/google/start`, `GET /v1/auth/google/callback`, `POST /v1/auth/google/complete`; adaptador con `openid-client`; contrato primero | Sí |
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
| 5 | Una cuenta con contraseña no puede confirmar con el correo: sigue pidiendo la contraseña | `delete-own-account.spec.ts` | Se programa la eliminación |
| 6 | La base guarda y devuelve cuentas sin contraseña (migración y repositorios) | `test/integration/identity-repositories.spec.ts` | `password_hash` es `NOT NULL` |
| 7 | `POST /v1/me/account-deletion` acepta `confirmEmail` en lugar de `password` (exactamente uno de los dos) y lo refleja el contrato | `test/integration/account-deletion-http.spec.ts` y `docs/openapi.yaml` | 400 con `confirmEmail` |

**Terminado cuando:** las pruebas de inicio de sesión, restauración y eliminación pasan con cuentas sin contraseña; la prueba guardiana del esquema (`privacy-schema.spec.ts`) sigue en verde; `pnpm test`, `lint`, `typecheck` y `depcheck` en verde.

## Riesgos y decisiones abiertas

- **Robo de cuenta por registro previo.** Alguien registra con contraseña el correo de otra persona y no lo verifica; si esa persona entra luego con Google, se vincularía a una cuenta cuya contraseña conoce el atacante. Mitigación del paso 2: al vincular una cuenta **sin verificar**, se borra su contraseña y se cierran sus sesiones.
- **Client secret.** El cliente OAuth tiene un secreto que termina en `…92dB`; Google ya no lo muestra. Si nadie lo guardó, se crea uno nuevo antes del paso 3 y se guarda solo en Render.
- **Reenvío de Vercel.** La redirección de Google llega a `www.valoora.app/v1/...` y Vercel la reenvía a Render. `TRUST_PROXY` ya lo cubre; el paso 5 lo prueba de punta a punta.

## Reparto sugerido

Pasos 1 y 2 en orden (el 2 usa el tipo de cuenta del 1). Paso 3: quien lleva el backend. Paso 4: quien lleva el frontend. Paso 5: quien administra Render y Google Cloud.
