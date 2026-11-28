# Contradicciones entre fuentes — registro a 2026-11-16

Qué dicen distinto Notion, el repositorio y los mensajes del equipo, y cómo se resuelve cada una. Fuentes: `docs/academico/as-e*.md`, `docs/DECISIONS.md`, `docs/openapi.yaml`, Notion (lectura del 16-nov), mensajes de Sara.

Regla usada: **cuando un dato se puede comprobar en el código, manda el código** (y se corrige la página que lo contradice). Cuando es una **decisión** del equipo, no se asume: se propone y decide el equipo. Nada de esto se ha cambiado en Notion.

> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Resueltas con datos

| # | Asunto | Qué se vio | Resolución |
|---|---|---|---|
| R1 | Rutas del OpenAPI: 33 (Sara) o 32 (lectura previa) | `dev` tiene 33 rutas y 33 operaciones (4 de `/commerce/*`, `x-corte: 3`). El 32 se contó antes de integrar `GET /v1/featured-products` (PR #122) | **33 es correcto.** Los documentos de este repo ya dicen 33 |
| R2 | Pruebas del frontend: 295 (Sara) o 298 (lectura local) | `dev` en `cdcf81f`: 295. La rama `feat/despliegue-vercel` añade 3 (`src/vercelConfig.spec.ts`) | **295 es correcto para `dev`;** 298 solo en esa rama |
| R3 | Backend 753 pruebas (AS-E3) | En `dev` actualizado y con la rama de despliegue: 795 (incluye las nuevas) | Citar siempre el commit al que se refiere la cifra |

## 2. Abiertas: decide el equipo

| # | Asunto | Fuentes que chocan | Propuesta | Dónde se corrige |
|---|---|---|---|---|
| A1 | **ADR-012** (despliegue): «En discusión» o aceptado | Notion, propiedad: En discusión. `DECISIONS.md` y AS-E3 de Sara: aceptado el 16-nov (Render, Neon, Vercel; PR #123) | Marcarlo **Aceptado (16-nov-2026)** en la base ADRs, porque el equipo lo decidió y lo integró | Notion (base ADRs); `docs/adr/0012` ya lo anota |
| A2 | **AS-E3 de Sara** dice a la vez «Hoy no existe `Dockerfile`» (§4) y marca `[x] Dockerfile … PR #123` | Notion AS-E3 §4 frente a su propia lista | Quitar la frase «Hoy no existe…» (el `Dockerfile` existe en `dev`) | Notion (AS-E3, la edita Sara) |
| A3 | **ADR-019** tiene dos filas con temas distintos y la propiedad dice «Propuesto» mientras el texto dice «ACEPTADA el 16-nov» | Notion (dos filas); repo: `0019-mapa-osm-leaflet.md` y otro «ADR-019» sobre tipos de establecimiento | Renumerar una de las dos (ID libre: 023) y marcar Aceptado la de OSM/Leaflet | Notion y `DECISIONS.md` |
| A4 | **ADR-007** figura aceptado y propuesto | `DECISIONS.md` (ambos) y Notion | El equipo confirma cuál; sin registro en la Auditoría | Notion y `DECISIONS.md` |
| A5 | **ADR-004** «Propuesto» en Notion, «aceptado el 12-nov» en `DECISIONS.md` | Notion frente a `DECISIONS.md` | Alinear Notion con `DECISIONS.md` si el equipo confirma | Notion |
| A6 | ADR-004, 006, 008, 009, 013, 016 «Propuesto» pero ya aplicados en el código | Notion frente al código | Confirmar y marcar Aceptado los que ya rigen, o documentar que siguen en prueba | Notion |
| A7 | **Duplicados en la base ADRs**: ADR-020 y 021 con varias filas y una fila vacía sin ID; 22 filas en una lectura y 25 en otra | Notion | Fusionar los duplicados y borrar la fila vacía (acción destructiva: la hace el equipo) | Notion |
| A8 | ADR-010 dice que ADR-017 «continúa Propuesto»; ADR-017 figura Aceptado | Notion | Actualizar el texto de ADR-010 | Notion |
| A9 | **Diagrama de despliegue** `docs/diagramas/12-despliegue.mmd` dice «Sin Docker en el MVP» | El diagrama frente a ADR-012 | Regenerar el diagrama con Render, Neon y Vercel (`docs/diagramas/README.md` indica el comando) | Repo (`dev`) |
| A10 | Calendario de entregables: AS-E3, AS-E4 y MC-E3 siguen «Sin iniciar» con contenido ya redactado; los 4 de Corte 1 siguen «En revisión» con fecha vencida (10-nov) | Notion (calendario) | Actualizar estados con evidencia, sin marcar «terminado» lo que no la tiene | Notion (calendario) |
| A11 | La página «Entregables» (índice) y su Guía de uso dicen que los cortes 2 y 3 son plantillas | Notion, 9-nov, frente a AS-E3, AS-E4, MC-E3, MC-E4 con contenido | Actualizar el índice | Notion |
| A12 | Ítems de Seguimiento: «16 épicas» frente a 17 registros, una fila sin título | Notion | Corregir el conteo o eliminar la fila vacía | Notion |
| A13 | **Notion «Arquitectura y stack»** frente a `docs/ARCHITECTURE.md`: la lectura de comparison (¿consulta confiabilidad al leer o lee `price_current` precalculada?); nombres de eventos (`PriceReported` frente a `PrecioReportado`) | Notion frente a `ARCHITECTURE.md` y `src/` | Verificar contra el código y corregir la que no coincida | Notion o `ARCHITECTURE.md`, según el código |
| A14 | Notion cita `docs/c4/` para los diagramas; el repo los tiene en `docs/diagramas/` (`docs/c4/` solo trae un `structurizr-proposal.dsl`) | Notion frente al repo | Corregir la ruta en Notion | Notion |
| A15 | ADR-015 invoca la regla «sin Docker», ya reemplazada; ADR-003 cita ADR-019 con fecha 10-nov | Notion / `docs/adr` | Actualizar las referencias | Notion |
| A16 | ADR-016: el título en Notion no coincide con el uso en `openapi.yaml` | Notion frente a `openapi.yaml` | Alinear título y uso | Notion |
| A17 | La guía: las secciones 3.x citadas por la lectura no existen; los entregables están en §8–§10 | Guía íntegra en `docs/academico/guia/` | Citar siempre §8, §8.1, §9 y §10 | Ya aplicado en este repo |
| A18 | RDA2 «orientado a servicios» frente a un monolito modular (ADR-001) | Guía y Auditoría | Aclarar con el docente; Sara retiró de su rama el pendiente de RDA3 | Decisión del equipo con el docente |
| A19 | «Los demás entregables ya están hechos» (Sara) frente a Notion: MC-E3 y MC-E4 con contenido; MC-E5, MC-E6, DR-1 y SU-1 en plantilla | Mensajes frente a Notion | Pedir a Sara dónde está lo que falta, o confirmar que es de Corte 3 | Equipo |

## 3. Qué cambiaría en Notion si el equipo lo aprueba

Nada se ha escrito en Notion. Propuesta, de menor a mayor riesgo:

1. **Sin riesgo (marcas, no borrados):** A1 (estado de ADR-012), A5, A10, A11, A12, A14, A15.
2. **Edición de texto de páginas de Sara:** A2 (AS-E3 §4) y A8: la edita ella o se hace con su visto bueno.
3. **Destructivo o de numeración:** A3 (renumerar ADR-019) y A7 (fusionar o borrar filas): hubo dos incidentes de borrado el 9-nov, así que solo con confirmación explícita y copia previa.


## 4. Actualización de estados ADR — 28-nov-2026

La tabla de §2 conserva la fotografía histórica de la lectura del 16-nov-2026. Tras consultar la base ADRs de Notion y los archivos de la rama `dev`, las siguientes contradicciones de estado se consideran resueltas:

| Referencia histórica | Estado verificado al 28-nov-2026 | Resolución |
|---|---|---|
| A1 — ADR-012 | Aceptado en Notion y en `docs/DECISIONS.md`, con fecha 16-nov-2026 | Resuelta; no queda pendiente de confirmación |
| A3 — ADR-019 | Una ficha en Notion, Aceptado el 16-nov-2026; `docs/adr/0019-mapa-osm-leaflet.md` y `DECISIONS.md` describen el mismo tema | Resuelta; no se renumera ni se crea un segundo ADR-019 |
| A4 — ADR-007 | Aceptado en Notion y en `docs/adr/0007-catalogo-canonico.md`, fecha 11-nov-2026 | Resuelta; `DECISIONS.md` lo registra en la sección Catálogo |
| A5 — ADR-004 | Aceptado en Notion y en `docs/adr/0004-cqrs-precio-vigente.md`, fecha 12-nov-2026 | Resuelta |
| A6 — ADR-004, 006, 008, 009, 013 y 016 | Aceptados en Notion y en sus archivos individuales; también figuran en la tabla de `DECISIONS.md` | Resuelta; las brechas de medición o validación no revierten por sí solas el estado de decisión |

El estado global consultado en Notion es 39 Aceptados y 2 Propuestos (ADR-023 y ADR-024), sobre 41 registros. Esta conciliación actualiza los estados, no reescribe las fechas ni convierte las brechas de calidad en verificaciones cumplidas. Las demás entradas de la tabla histórica se mantienen fuera del alcance de esta corrección.
