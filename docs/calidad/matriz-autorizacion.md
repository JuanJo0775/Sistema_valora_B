# Matriz de autorización por rol

- **Requisitos:** RF-002 (RN3: un reportante no modera), RF-013, RNF-010 (100 % de rutas sensibles con control de rol), PR-14 (20 casos de autorización), EC-08.
- **Issues:** #33, #73 (cambio de rol), #71 (apelación), #76 (mis aportes) y #27 (propuestas de tiendas). Fecha: 14 de noviembre de 2026.
- **Cómo se reproduce:** `corepack pnpm exec jest test/integration/authorization-matrix.spec.ts test/integration/route-guardian.spec.ts --runInBand`.

## Actores

| Actor | Qué es |
|---|---|
| Sin sesión | El consumidor: consulta sin cuenta (grill de la #33, pregunta 1). |
| Reportante | Cuenta registrada: reporta precios y marca precios dudosos. |
| Moderador | Revisa la cola y decide. Se crea con `pnpm identity:set-role` o lo sube otro moderador (#73). |
| Comercio | Llega con el Corte 3; hoy no tiene rutas propias. |
| Suspendida | Reportante con `suspended_until` en el futuro. Desde la #71 tiene una sesión limitada: ve el estado de sus reportes, apela y cierra sesión; lo demás responde 403 `ACCOUNT_SUSPENDED`. |

## Rutas con sesión

«Permitido» significa que la ruta pasa el control de sesión y rol (la respuesta puede ser 2xx, 400 o 404 según el cuerpo, nunca 401 ni 403).

Desde ADR-029, `POST /v1/reports` también exige el correo verificado: un reportante sin verificar recibe 403 `EMAIL_NOT_VERIFIED`. La matriz usa cuentas ya verificadas.

| Ruta | Sin sesión | Reportante | Moderador | Comercio | Suspendida |
|---|---|---|---|---|---|
| `POST /v1/reports` | 401 | Permitido | 403 | 403 | 403 |
| `POST /v1/reports/{reportId}/flag` | 401 | Permitido | 403 | 403 | 403 |
| `POST /v1/reports/{reportId}/appeal` | 401 | Permitido | 403 | 403 | Permitido |
| `GET /v1/me/reports/{reportId}/status` | 401 | Permitido | 403 | 403 | Permitido |
| `GET /v1/me/reports` | 401 | Permitido | 403 | 403 | Permitido |
| `POST /v1/establishment-proposals` | 401 | Permitido | 403 | 403 | 403 |
| `GET /v1/moderation/store-proposals` | 401 | 403 | Permitido | 403 | 403 |
| `POST /v1/moderation/store-proposals/{proposalId}/decision` | 401 | 403 | Permitido | 403 | 403 |
| `POST /v1/product-requests` | 401 | Permitido | 403 | 403 | 403 |
| `GET /v1/moderation/product-requests` | 401 | 403 | Permitido | 403 | 403 |
| `POST /v1/moderation/product-requests/{requestId}/decision` | 401 | 403 | Permitido | 403 | 403 |
| `PUT /v1/moderation/products/{productId}/image` | 401 | 403 | Permitido | 403 | 403 |
| `GET /v1/moderation/queue` | 401 | 403 | Permitido | 403 | 403 |
| `POST /v1/moderation/{itemId}/decision` | 401 | 403 | Permitido | 403 | 403 |
| `POST /v1/moderation/roles` | 401 | 403 | Permitido | 403 | 403 |
| `GET /v1/auth/session` | 401 | Permitido | Permitido | Permitido | Permitido |
| `POST /v1/auth/logout` | 401 | Permitido | Permitido | Permitido | Permitido |
| `POST /v1/me/password` (ADR-033) | 401 | Permitido | Permitido | Permitido | Permitido |
| `POST /v1/me/account-deletion` (ADR-032) | 401 | Permitido | Permitido (salvo el último moderador: 403 `LAST_MODERATOR_CANNOT_DELETE`) | Permitido | Permitido |

**85 casos**, todos en verde (`authorization-matrix.spec.ts`). `POST /v1/me/password` tampoco está en esos 85 casos por la misma razón (con el cuerpo vacío responde 400 y con la contraseña actual mala, 403 `INVALID_PASSWORD`); su control de sesión y CSRF se prueba en `password-reset-http.spec.ts` y `route-guardian.spec.ts`, y puede usarla cualquier rol. `POST /v1/me/account-deletion` no está en esos 85 casos porque con el cuerpo vacío responde 400 y con una contraseña mala 403 `INVALID_PASSWORD`, que la matriz leería como «sin permiso»; su control de sesión, CSRF y rol (cualquiera) se prueba en `account-deletion-http.spec.ts` y `route-guardian.spec.ts`. Las rutas que modifican datos además exigen la cabecera `X-CSRF-Token` (403 `CSRF_TOKEN_INVALID` sin ella; probado en `identity-http.spec.ts` y `moderation-http.spec.ts`).

## Comercio: reclamo de una tienda (ADR-038, H11)

La regla de cadenas no cambia quién puede llamar: `POST /v1/commerce/claims` sigue siendo solo del reportante con el correo verificado y `POST /v1/moderation/merchant-cases/{caseId}/decision` solo del moderador (lo cubre `route-guardian.spec.ts`). Lo que cambia es el orden de los controles dentro de `POST /v1/commerce/claims`: sin sesión 401, correo sin verificar 403, tienda de cadena 422 `CHAIN_STORE_NOT_CLAIMABLE` (antes de la cercanía, así quien está lejos de una D1 no recibe la pista falsa de acercarse), lejos 422 `NOT_AT_ESTABLISHMENT`. `commerce-claims-http.spec.ts` comprueba 401 y 403 antes de la regla de cadena. Un supermercado que no es de cadena no concede el rol: solo `aprobar` del moderador publica `MerchantVerified`.

## Rutas públicas

`GET /v1/health`, `GET /v1/products`, `GET /v1/products/{productId}`, `GET /v1/products/{productId}/comparison`, `GET /v1/featured-products` (B#120), `GET /v1/establishments` (#116), `GET /v1/establishments/nearby`, `GET /v1/establishments/{establishmentId}/prices` (#28), `POST /v1/auth/register`, `POST /v1/auth/login` y `POST /v1/auth/restore-account` (ADR-032; la credencial es el correo con la contraseña), `POST /v1/auth/forgot-password` y `POST /v1/auth/reset-password` (ADR-033; la credencial de la segunda es el token del enlace del correo, y la primera responde siempre 202).

## Guardián de rutas (RNF-010)

`route-guardian.spec.ts` recorre todos los controladores de la aplicación y falla si:

- una ruta que no está en la lista pública no tiene `SessionGuard`;
- una ruta con sesión no declara `@Roles`, salvo `GET /auth/session` y `POST /auth/logout`, que sirven a cualquier rol;
- la lista pública nombra una ruta que ya no existe.

Se comprobó que falla al quitar `@Roles` de `POST /reports/{reportId}/flag`. Resultado: **13 de 13 rutas con sesión tienen control** (100 %).

## Fuera de esta matriz

- Comercio limitado a su propia tienda (RF-002 RN2): Corte 3.
