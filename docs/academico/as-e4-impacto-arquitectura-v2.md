# AS-E4 · Análisis de impacto y arquitectura v2 — enlace y brechas

> **Entregable 4 de Arquitectura de Software II · Corte 2.** Efecto del módulo comercial sobre la arquitectura, componentes afectados, **estimación de esfuerzo antes de modificar**, arquitectura actualizada y ADR nuevos o reemplazados (Guía §8 Fase 4, §9 Corte 2). Base del escenario EC-05.
>
> **El contenido vive en Notion** (página `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`, preanálisis del 16-nov redactado por Sara Valentina Sánchez Estrada). Este archivo **no lo copia ni lo reescribe**. **No contiene cifras de esfuerzo**: se dejan a propósito sin llenar (decisión de JuanJo del 16-nov).
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Qué hay y qué falta

Según el resumen que Sara dio a JuanJo el 16-nov (no verificado contra la página):

- **Hecho:** preanálisis con el código actual: lo que el núcleo ya tiene listo para `commerce` (regla de la CI, outbox, `promotions`, `source`, rol `comercio`) y los componentes que se verían afectados, con sus riesgos.
- **En blanco a propósito:** la tabla de horas. El equipo la estima el **23-nov**, después de la presentación y antes del primer commit del módulo, para que EC-05 mida la estimación frente al esfuerzo real.
- **Falta:** arquitectura v2 y revisión de los ADR.

## 2. Estado verificable en el repositorio

| Elemento | Verificado | Fuente |
|---|---|---|
| Rutas `/commerce/*` | 4 rutas declaradas con `x-corte: 3`, sin código en `src/modules/commerce` | `docs/openapi.yaml`; ver `as-e5-sistema-integrado.md` §2.1 |
| Reserva en el núcleo | `promotions: []` fijo en la respuesta de comparación; caso `verifiedCommerce` en `neutral-ranking.spec.ts` | `src/modules/comparison/...` |
| Diagramas de evolución | `docs/diagramas/13-evolucion.mmd` y `08-sec-oficial.mmd` | repo |
| ADR relacionados | ADR-008 precio oficial vs reportado, ADR-009 neutralidad de promociones, ADR-016 comercios pequeños: los tres figuran «Propuesto» en Notion | `docs/adr/0008-…`, `0009-…`, `0016-…` |

## 3. Honestidad de EC-05

Las rutas comerciales **ya están en el contrato** (corte 3), pero no hay código del módulo. Si el equipo estima el 23-nov y empieza a modificar después, la estimación es anterior a la modificación. `PENDIENTE (equipo)`: dejar constancia de la fecha de la estimación y de que no se ha iniciado código del módulo, para que no se lea como estimación hecha a posteriori.

## 4. Pendientes y riesgos

- Estimación de esfuerzo: `PENDIENTE (equipo)`, método y cifras del 23-nov. Este archivo no propone ninguna.
- Arquitectura v2: `PENDIENTE (equipo)`; debe partir de `docs/ARCHITECTURE.md` y `docs/diagramas/13-evolucion.mmd`.
- ADR a decidir o revisar: 008, 009, 016 (Propuestos); posibles ADR nuevos si el módulo cambia decisiones. `SUPUESTO:` su creación se decide tras la estimación; no se redactan aquí.
- Los RF comerciales RF-015 a RF-018 están «Por definir» en Notion.

## 5. Fuentes de referencia

- Notion: AS-E4 `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`; RF y escenarios EC-05 y EC-06.
- Repo: `docs/openapi.yaml`, `docs/diagramas/13-evolucion.mmd`, `docs/academico/as-e5-sistema-integrado.md`, `docs/academico/as-e6-evaluacion-final.md`, `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md`.
