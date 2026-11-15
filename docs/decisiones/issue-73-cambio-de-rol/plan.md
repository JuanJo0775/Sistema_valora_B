# Plan — issue #73: cambio de rol auditado y creación de moderadores

- **Rama:** `feat/identity-cambio-de-rol` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #73`.
- **Relación:** Corte 2, épica #1. RF-002 (RN1, RN4), RF-013 (conflicto de interés), EC-08.
- **Decisiones:** `grill.md` (5 preguntas). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna.

## Diseño

1. **`identity` (migración `0015_identity-role-changes`):** tabla `role_changes` con trigger que rechaza `UPDATE` y `DELETE`.
2. **`ChangeRole`** (caso de uso): busca por correo, valida (propio rol, rol igual, motivo), cambia el rol y anota en la bitácora en una transacción. Quien cambia es una cuenta o el sistema.
3. **HTTP:** `RolesController` en `identity` (`POST /v1/moderation/roles`), con `SessionGuard`, `@Roles('moderador')` y límite por moderador.
4. **Comando:** `src/set-role.ts` y el script `identity:set-role`.
5. **`reliability`:** `DecideModeration` rechaza un reporte propio (`OwnReportError`, 409).

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Persistencia (integración):**

1. La cuenta cambia de rol y el cambio queda en una bitácora que no se puede modificar.

**`ChangeRole`:**

2. Un moderador vuelve moderadora a una reportante, y queda anotado quién, qué, cuándo y por qué.
3. Un moderador devuelve a reportante a otro moderador.
4. No se cambia el propio rol, ni a un rol que ya tiene, ni sin motivo; un correo desconocido no existe.
5. El sistema también cambia roles, anotado sin autor.

**HTTP:**

6. `POST /v1/moderation/roles`: 204, 400, 401, 403, 404, 409; el cambio se nota en la siguiente petición.
7. Límite de 20 cambios por moderador en 15 minutos (429).
8. La matriz de autorización y el guardián incluyen la ruta nueva.

**Comando:**

9. `identity:set-role` crea un moderador y lo anota como sistema (integración).

**`reliability`:**

10. Un moderador no decide sobre un reporte propio (409 `OWN_REPORT`).

## Otras tareas

- **Documentos:** `openapi.yaml`, `docs/calidad/matriz-autorizacion.md`, README (comando en lugar del `UPDATE`) y `DECISIONS.md`.
- **Notion:** EPIC-B01 y RF-002.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
