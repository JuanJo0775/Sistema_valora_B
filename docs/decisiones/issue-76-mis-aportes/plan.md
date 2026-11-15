# Plan — issue #76: lista de mis aportes con su estado

- **Rama:** `feat/reliability-mis-aportes` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #76`.
- **Relación:** Corte 2, épica #5. RF-006, RF-013, EC-08.
- **Decisiones:** `grill.md` (2 preguntas). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna. **Migraciones:** ninguna.

## Diseño

1. **Almacén:** `ModerationStore.authoredBy(reporterKey, { limit, before })`: las observaciones de una clave, la más reciente primero, con sus marcas, su apelación y la fecha del descarte.
2. **Regla del estado:** `reportStateOf(...)` (función de la aplicación), que usan `ReportStatus` y la lista.
3. **`MyReports`:** arma los aportes con los nombres y la página siguiente.
4. **HTTP:** `GET /v1/me/reports` en `MyReportsController`.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

1. **Persistencia (integración):** las observaciones de un autor, la más reciente primero, con límite y cursor, sus marcas, su apelación y la fecha del descarte; nunca las de otra clave.
2. **Refactor:** la regla del estado sale de `ReportStatus` a `reportStateOf` (pruebas en verde, sin cambiar comportamiento).
3. **`MyReports`:** cada aporte con su producto, su tienda, su precio y su estado, y hasta cuándo se puede apelar.
4. **`MyReports`:** límite de 20 por defecto, cursor `before` y `nextBefore` solo con la página llena.
5. **HTTP:** 200 con la forma del contrato y `no-store`; 400 con `limit` o `before` inválidos; 401 y 403; la cuenta suspendida también la ve; sin claves ni datos de moderadores.
6. **Matriz y guardián:** la ruta nueva.

## Otras tareas

- **Documentos:** `openapi.yaml`, matriz, README y `DECISIONS.md`.
- **Notion:** EPIC-B05 y RF-006.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
