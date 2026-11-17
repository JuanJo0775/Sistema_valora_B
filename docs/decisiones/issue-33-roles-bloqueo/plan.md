# Plan — issue #33: roles, suspensión de cuentas y matriz de autorización

- **Rama:** `feat/identity-roles-bloqueo` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #33`.
- **Relación:** Corte 2, épica #1. RF-002, RF-013 (RN6), EC-08, PR-14, RNF-010.
- **Decisiones:** `grill.md` (8 preguntas). Contrato y evento: `contrato-api.md`.
- **Fuera de alcance:** cambio de rol auditado y creación de moderadores desde la app (issue nueva); comercio limitado a su tienda (Corte 3).
- **Dependencias nuevas:** ninguna.

## Diseño

1. **Dominio:** `src/domain/suspension.ts` con `SUSPENSION_PARAMS` (3 descartes, 7 días) y la regla de la racha.
2. **`identity` (migración `0014_identity-suspension`):** columnas `reporter_key` (única) y `suspended_until` en `accounts`.
   - `ReporterIdentity` guarda la clave al calcularla.
   - `SuspendReporter`: busca por clave, extiende `suspended_until` y revoca las sesiones.
   - `Login` rechaza una cuenta suspendida con `AccountSuspendedError` (403); `ResolveSession` no acepta sesiones de una cuenta suspendida.
   - Suscriptor de `ReporterSuspensionRequested`.
3. **`reliability`:** `DecideModeration` publica `ReporterSuspensionRequested` con `observar_cuentas` y cuando un `descartar` completa la racha; el almacén da las decisiones de una clave en orden.
4. **Matriz:** documento, prueba HTTP por tabla y prueba guardiana de rutas.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Dominio:**

1. Tres descartes seguidos suspenden; un aprobar corta la racha; observar no cuenta.
2. La racha suspende de nuevo en el sexto descarte, no en el cuarto ni en el quinto; la suspensión termina 7 días después de la decisión.

**`identity`:**

3. Al calcular la clave seudónima, queda guardada en la cuenta (integración).
4. Suspender por clave extiende la fecha (nunca la acorta) y revoca las sesiones; una clave desconocida no hace nada.
5. Una cuenta suspendida no inicia sesión hasta la fecha de fin; después, sí.
6. Una sesión de una cuenta suspendida no se acepta.
7. `ReporterSuspensionRequested` suspende la cuenta por el outbox (integración).

**`reliability`:**

8. `observar_cuentas` pide suspender al autor 7 días.
9. El tercer descarte seguido del mismo autor pide suspenderlo; con un aprobar en medio, no.

**HTTP y matriz:**

10. Login de una cuenta suspendida: 403 `ACCOUNT_SUSPENDED`; con contraseña incorrecta, 401.
11. Matriz de autorización: cada ruta con sesión frente a sin sesión, reportante, moderador, comercio y suspendida (20 casos o más).
12. Guardián: toda ruta fuera de la lista pública tiene `SessionGuard` y `@Roles`.
13. **De punta a punta:** tres descartes seguidos dejan al autor sin sesión (401) y sin poder entrar (403); la cola y los eventos no llevan su cuenta (EC-08).

## Otras tareas

- **Issue nueva:** cambio de rol auditado y creación de moderadores (RF-002 RN1 y RN4).
- **Documentos:** `openapi.yaml`, `docs/calidad/matriz-autorizacion.md`, `DECISIONS.md`, `ARCHITECTURE.md` (evento nuevo) y README.
- **Notion:** EPIC-B01, RF-002 y RF-013.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build`, `test:cov --runInBand` y `reliability:evaluate` en verde.
