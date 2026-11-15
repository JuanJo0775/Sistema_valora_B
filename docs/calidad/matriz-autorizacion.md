# Matriz de autorización por rol

- **Requisitos:** RF-002 (RN3: un reportante no modera), RF-013, RNF-010 (100 % de rutas sensibles con control de rol), PR-14 (20 casos de autorización), EC-08.
- **Issues:** #33 y #73 (cambio de rol). Fecha: 14 de noviembre de 2026.
- **Cómo se reproduce:** `corepack pnpm exec jest test/integration/authorization-matrix.spec.ts test/integration/route-guardian.spec.ts --runInBand`.

## Actores

| Actor | Qué es |
|---|---|
| Sin sesión | El consumidor: consulta sin cuenta (grill de la #33, pregunta 1). |
| Reportante | Cuenta registrada: reporta precios y marca precios dudosos. |
| Moderador | Revisa la cola y decide. Hoy se crea por SQL (README). |
| Comercio | Llega con el Corte 3; hoy no tiene rutas propias. |
| Suspendida | Cuenta con `suspended_until` en el futuro, aunque su sesión siga abierta. |

## Rutas con sesión

«Permitido» significa que la ruta pasa el control de sesión y rol (la respuesta puede ser 2xx, 400 o 404 según el cuerpo, nunca 401 ni 403).

| Ruta | Sin sesión | Reportante | Moderador | Comercio | Suspendida |
|---|---|---|---|---|---|
| `POST /v1/reports` | 401 | Permitido | 403 | 403 | 401 |
| `POST /v1/reports/{reportId}/flag` | 401 | Permitido | 403 | 403 | 401 |
| `GET /v1/moderation/queue` | 401 | 403 | Permitido | 403 | 401 |
| `POST /v1/moderation/{itemId}/decision` | 401 | 403 | Permitido | 403 | 401 |
| `POST /v1/moderation/roles` | 401 | 403 | Permitido | 403 | 401 |
| `GET /v1/auth/session` | 401 | Permitido | Permitido | Permitido | 401 |
| `POST /v1/auth/logout` | 401 | Permitido | Permitido | Permitido | 401 |

**35 casos**, todos en verde (`authorization-matrix.spec.ts`). Las rutas que modifican datos además exigen la cabecera `X-CSRF-Token` (403 `CSRF_TOKEN_INVALID` sin ella; probado en `identity-http.spec.ts` y `moderation-http.spec.ts`).

## Rutas públicas

`GET /v1/health`, `GET /v1/products`, `GET /v1/products/{productId}`, `GET /v1/products/{productId}/comparison`, `GET /v1/establishments/nearby`, `POST /v1/auth/register` y `POST /v1/auth/login`.

## Guardián de rutas (RNF-010)

`route-guardian.spec.ts` recorre todos los controladores de la aplicación y falla si:

- una ruta que no está en la lista pública no tiene `SessionGuard`;
- una ruta con sesión no declara `@Roles`, salvo `GET /auth/session` y `POST /auth/logout`, que sirven a cualquier rol;
- la lista pública nombra una ruta que ya no existe.

Se comprobó que falla al quitar `@Roles` de `POST /reports/{reportId}/flag`. Resultado: **7 de 7 rutas con sesión tienen control** (100 %).

## Fuera de esta matriz

- Comercio limitado a su propia tienda (RF-002 RN2): Corte 3.
