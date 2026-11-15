# Plan — issue #71: apelación de un reporte descartado

- **Rama:** `feat/reliability-apelacion` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #71`.
- **Relación:** Corte 2, épica #5. RF-013 (RN4), EC-03, EC-08.
- **Decisiones:** `grill.md` (4 preguntas). Contrato y evento: `contrato-api.md`.
- **Fuera de alcance:** `GET /v1/me/reports` (la lista de aportes); issue nueva.
- **Dependencias nuevas:** ninguna.

## Diseño

1. **Dominio:** plazo de apelación (7 días) y paso de reputación `appealAccepted` (+0,20).
2. **`reliability` (migración `0016_reliability-appeals`):** tabla `appeals` (una por reporte) y columna `stage` en `moderation_log`. La cola incluye las apelaciones pendientes; las decisiones de una clave tratan el descarte revertido como `aprobar` e ignoran las de apelación.
3. **Casos de uso:** `AppealReport`, `ReportStatus` y `DecideModeration` ampliado para las apelaciones.
4. **`identity`:** suscriptor de `ReporterSuspensionLifted`.
5. **HTTP:** rutas de apelar y de estado; cola y decisión con los códigos nuevos.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Dominio:**

1. Se puede apelar hasta 7 días después del descarte; una apelación aceptada devuelve 0,20 de reputación.

**Persistencia (integración):**

2. Una apelación por reporte; la cola trae las apelaciones pendientes; la bitácora guarda la etapa; para la racha, un descarte revertido cuenta como aprobar y las decisiones de apelación no cuentan.

**`AppealReport`:**

3. El autor apela su reporte descartado con motivo.
4. No apela otra cuenta, ni un reporte no descartado, ni dos veces, ni pasado el plazo, ni sin motivo.

**Cola:**

5. La apelación aparece primero, con el motivo del autor y sin quién descartó.

**`DecideModeration` sobre una apelación:**

6. Quien descartó no decide la apelación; `observar_cuentas` no aplica.
7. Aceptar: el reporte vuelve a contar, se publica como normal y el autor recupera 0,20.
8. Aceptar un descarte que causó la suspensión publica `ReporterSuspensionLifted` con la fecha de esa suspensión.
9. Rechazar: el reporte sigue descartado, sin otra baja de reputación ni otro descarte en la racha.

**`identity`:**

10. `ReporterSuspensionLifted` levanta la suspensión solo si la fecha coincide (integración).

**`ReportStatus`:**

11. El autor ve el estado de su reporte y hasta cuándo puede apelar; otra cuenta no lo encuentra.

**HTTP:**

12. Apelar: 202, 400, 401, 403, 404, 409, 422.
13. Estado: 200, 401, 403, 404.
14. Decisión sobre una apelación: 409 `SAME_MODERATOR` y 422 `DECISION_NOT_ALLOWED`.
15. La matriz de autorización y el guardián incluyen las rutas nuevas.
16. **De punta a punta:** un descarte que suspende, la apelación, otro moderador la acepta y el precio vuelve a la comparación, la cuenta recupera el acceso y el autor ve «apelación aceptada» sin saber quién decidió (EC-08).

## Otras tareas

- **Issue nueva:** `GET /v1/me/reports` (lista de aportes con su estado).
- **Documentos:** `openapi.yaml`, `ARCHITECTURE.md` (evento nuevo), matriz, README y `DECISIONS.md`.
- **Notion:** EPIC-B05 y RF-013.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build`, `test:cov --runInBand` y `reliability:evaluate` en verde.
