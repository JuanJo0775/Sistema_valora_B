# Plan — issue #30: sincronización sin conexión, lado del servidor

- **Rama:** `feat/pricing-sincronizacion` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #30`.
- **Relación:** Corte 2, épica #4. RF-007, EC-07, RNF-013, PR-07, PR-08, ADR-010.
- **Decisiones:** `grill.md` (3 preguntas).
- **Sin rutas nuevas ni migraciones.** Cambia la regla de los límites de la #29 (por hora de observación).

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Dominio (`src/domain/report-limits.ts`):**

1. La ráfaga cuenta las observaciones dentro de una misma hora, no las llegadas: 21 observadas en una hora son ráfaga aunque lleguen en desorden; 50 repartidas en el día no lo son.
2. El reporte que completa 20 observaciones en una hora avisa a moderación con los reportes de esa hora.

**`pricing`:**

3. **Persistencia (integración):** los reportes de una cuenta observados entre dos fechas (reemplaza `recentOf`, que contaba por llegada).
4. El duplicado compara horas de observación: dos reportes de la misma presentación y tienda vistos con más de 60 minutos de diferencia no son duplicado, aunque lleguen juntos.
5. `RegisterReport` acepta 50 reportes de la cola observados a lo largo del día y enviados a la vez.

**Sincronización (integración por HTTP, PR-08):**

6. 50 reportes de la cola enviados a la vez, en desorden y cada uno reintentado (algunos al mismo tiempo): 50 recibidos, 0 duplicados (50 filas y 50 eventos), el precio vigente de cada tienda es el observado más recientemente, y el p95 de confirmación queda bajo 60 s.

## Otras tareas

- **Contrato:** la tabla de reintentos en la descripción de `POST /v1/reports`; 409 y 429 dicen que cuentan por la hora de observación.
- **Informe:** `docs/calidad/sincronizacion-ec07.md` con la medición.
- **Frontend:** issue en `Sistema_valora_F` con la tabla de reintentos para la cola (la cola y Playwright van allá).
- **Documentos:** `DECISIONS.md` (cambia la regla de la #29) y README. **Notion:** EPIC-B04 y RF-007.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build`, `test:cov --runInBand` y `reliability:evaluate` en verde.
