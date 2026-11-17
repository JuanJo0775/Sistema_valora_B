# AS-E1 · Nota de actualización (fe de erratas) a 2026-11-16

> **Entregable 1 de Arquitectura de Software II · Corte 1.** Esta nota **no copia ni reescribe** AS-E1. La versión consolidada vive en Notion (página `41339c4a-833b-815b-80c1-cec59763ca1d`, entregada el 9 de noviembre de 2026, sin ediciones posteriores según el delta del 16-nov). Aquí solo se listan las diferencias entre ese documento (y la página «Arquitectura y stack tecnológico», `40d39c4a-833b-80ff-a47c-fb7c2d06254e`, editada el 11-nov) y lo que el repositorio `Sistema_valora_B` dice o contiene hoy.
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Alcance y método

- Base de comparación: el repo en la rama `docs/entregables-arquitectura` (copia de trabajo del 16-nov-2026), `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/diagramas/` y `src/`.
- Cada fila marca el tipo de diferencia: **dato desactualizado** (Notion quedó atrás de algo ya verificable), **contradicción abierta** (dos fuentes dicen cosas incompatibles y nadie ha decidido cuál vale) o **pendiente de decisión** (el tema sigue abierto en las dos fuentes).
- No se verificó nada contra Notion en vivo en esta tarea: lo que se cita de Notion proviene de las lecturas del 16 y 17 de noviembre guardadas en el espacio de trabajo. El conector de GitHub falló, por lo que los commits y PR citados en Notion no se comprobaron.
- No se atribuye autoría: AS-E1 no nombra a su autor.

## 2. Tabla de diferencias verificadas

| # | Tema | Lo que dice AS-E1 / Notion | Lo que hay en el repo (evidencia) | Tipo |
|---|---|---|---|---|
| 1 | Recuento de ADR | AS-E1 §«Riesgos»: «8 aceptados, 9 propuestos y 1 en discusión» (estado del 9-nov). | `docs/DECISIONS.md`, tabla «Aprobadas», lista como aceptados: ADR-001, 002, 003, 004, 005, 010, 011, 014, 015, 018, 020, 021 (12 filas), más ADR-007 (aceptado el 11-nov, `DECISIONS.md` sección «Aplicación de ADR-007»). El delta de Notion del 16-nov confirma que en la base ADRs ADR-005, 015 y 007 pasaron a Aceptado y que la base tiene filas duplicadas (ADR-019 x2, 020 x2, 021 x2). El recuento 8/9/1 ya no es vigente. El recuento exacto actual **no se puede cerrar desde el repo**: ADR-006, 008, 009, 013, 016 y 019 no aparecen como aceptados en `DECISIONS.md` y la base de Notion tiene duplicados. | Dato desactualizado |
| 2 | Estado de ADR-004 | Notion (tabla del 9-nov y delta del 16-nov): ADR-004 «Propuesto». | `DECISIONS.md` fila ADR-004: «CQRS ligero con precio vigente precalculado (aceptado el 12 de noviembre de 2026)». | Contradicción abierta (Notion vs repo) |
| 3 | ADR como archivos | AS-E2 enlaza cada ADR como página de Notion. | `docs/adr/` solo contiene `0000-template.md`, `0020-imagenes-productos.md` y `0021-acceso-datos-drizzle.md`. **ADR-012 no existe como archivo**: solo se menciona en `DECISIONS.md`, `ARCHITECTURE.md`, `PLAN_MAESTRO.md`, `docs/diagramas/README.md` y en el ADR-020. Los demás ADR viven solo en Notion. | Pendiente de decisión (¿se exportan al repo?) |
| 4 | Rutas de `openapi.yaml` | AS-E1 §8 mantiene marcada «[x] Copiar openapi.yaml y los diagramas a docs/», sin verificar. Notion lista el contrato como «preliminar». | `docs/openapi.yaml` existe (OpenAPI 3.1.0, `info.version: 0.1.0-preliminar`, resumen «contrato preliminar del núcleo (corte 1)»). Contiene **33 rutas** (29 del núcleo y las 4 del módulo comercial `/commerce/claims`, `/commerce/prices`, `/commerce/prices/bulk`, `/commerce/promotions`, marcadas `x-corte: 3`) y **33 operaciones** HTTP. Conteo: `grep -c "^  /"` y `grep -c "^    (get\|post\|put\|patch\|delete):"`. La casilla se cumple, pero la versión y el resumen del contrato siguen diciendo «preliminar / corte 1» aunque el núcleo ya está implementado. | Dato desactualizado (la etiqueta «preliminar») |
| 5 | Carpeta de diagramas | Notion §10 y §3.1: los Mermaid viven en `docs/c4/`. | Los diagramas están en `docs/diagramas/`: 14 archivos `.mmd` con su `.png` (`00-alto-nivel` a `13-evolucion`) y `README.md`. `docs/c4/` existe, pero solo contiene `structurizr-proposal.dsl` (propuesta de herramienta, no decisión aprobada). La numeración local va de 0 a 13 y la de Notion de 1 a 14. | Dato desactualizado |
| 6 | Docker en el despliegue | Notion (callout del 9-nov, Figura 13 y §13): «Sin Docker en el MVP». | `DECISIONS.md` fila «Proyecto»: «Cambio del 15 de noviembre de 2026: el backend se despliega como una imagen descrita por un `Dockerfile`… Reemplaza la regla "sin Docker en el MVP" del 11 de noviembre». `ARCHITECTURE.md` y `docs/diagramas/README.md` (Figura 12) lo repiten. `docs/diagramas/12-despliegue.mmd` aún dice «Sin Docker en el MVP» (verificado con grep el 16-nov). **Actualizado en `dev` el 16-nov:** `DECISIONS.md` registra ADR-012 como aceptado el 16-nov-2026 (Render + Neon + Vercel; PR #123) y ya existen `Dockerfile` en etapas y `render.yaml` en B. En la base de Notion el estado sigue sin confirmarse (la propiedad es la fuente). | Parcialmente actualizado en `dev` el 16-nov; el diagrama 12 sigue desactualizado (contradicción abierta) |
| 7 | Despliegue y CI/CD | Notion Figura 13 y `12-despliegue.mmd`: GitHub Actions «despliega si todo pasa (meta ≤ 30 min, RNF-009)»; Caddy, Uptime Kuma y respaldos diarios. | `.github/workflows/ci.yml` tiene los jobs `calidad`, `pruebas` y `sonarqube`; **no hay job de despliegue en `dev`**. No hay Caddyfile ni configuración de monitoreo o respaldos en `dev`. Proveedor: ADR-012 aceptado el 16-nov-2026 en `DECISIONS.md` (Render, Neon, Vercel). En la rama `feat/despliegue-iac` (sin integrar) hay `deploy.yml`, `infra.yml`, `keepalive.yml`, `infra/neon/` (Terraform validado, no aplicado) y `docs/despliegue.md`. No hay URL pública (`PENDIENTE (equipo)`). Ver `as-e5-sistema-integrado.md`. | Decidido; implementación propuesta en rama, sin integrar |
| 8 | Eventos: bus y outbox | Notion Figuras 3, 4, 7 y 14 dibujan bus y outbox pero el texto dice que no son decisión aceptada (ADR-004/015 Propuestos). | `DECISIONS.md`: ADR-015 «aceptado el 11 de noviembre»; hay bus propio en `src/shared/events/` con outbox en `shared.outbox` (`DECISIONS.md` sección de la #43). | Dato desactualizado |
| 9 | Nombres y payloads de eventos | Notion §5: `PrecioReportado`, `ScoreActualizado`, `ReporteEnRevision`, `PrecioOficialPublicado`, `PromocionVencida`. | `ARCHITECTURE.md`: `PriceReported` v2, `PriceAssessed` v1, `PriceWithdrawn` v1, `ReporterSuspensionRequested` v1, `ReporterSuspensionLifted` v1 y `ReportBurstDetected` v1. Nombres en inglés y distintos. | Contradicción abierta (hay que decidir el nombre canónico y actualizar Notion) |
| 10 | Lectura de confiabilidad al consultar | Notion Figura 8 y §6.2: `comparison` lee solo `price_current` precalculada; la vigencia se calcula al leer; no llama a `reliability`. | `ARCHITECTURE.md`: al consultar, `comparison` pide a `reliability` la confiabilidad y confirmaciones de cada precio (`ReliabilityOfPrices`) a la hora actual. | Contradicción abierta (diseño distinto en cada fuente) |
| 11 | Moderación, suspensión y umbrales | Notion Figura 11 y §4: «cuentas en observación», un reporte por hora por cuenta, producto y establecimiento. | `ARCHITECTURE.md`: observación de cuentas, suspensión de 7 días, apelaciones y ráfaga de 20 reportes por hora. `docs/calidad/deteccion-anomalos.md` documenta el 40 % como valor provisional. Notion no menciona la suspensión ni la ráfaga. | Dato desactualizado (Notion no recoge lo implementado) |
| 12 | Rutas con o sin `/v1` | Notion: todas las rutas llevan `/v1`. | `ARCHITECTURE.md` las muestra sin `/v1`. `docs/openapi.yaml` declara `servers: https://api.valora.example/v1`, así que el prefijo está en la URL base y la diferencia es de redacción. | Aclarado (sin conflicto real) |
| 13 | Exclusiones: alertas de bajada de precio | Notion Figura 14 y §4 incluyen «alertas opcionales» en `commerce` (corte 3). | `ARCHITECTURE.md` («No incluido en el MVP») excluye el sistema de alertas. Notion RF-019 dice «opcional, fuera del MVP». Son compatibles si RF-019 se mantiene opcional. | Pendiente de decisión (aclarar si RF-019 entra) |
| 14 | Stack y ORM | Notion §9: «Drizzle o Kysely», sin seleccionar; trabajos diferidos con pgboss o tabla de trabajos. | `DECISIONS.md`: ADR-021 aceptado (11-nov), Drizzle ORM con migraciones SQL; bus propio en lugar de `@nestjs/event-emitter`. | Dato desactualizado |
| 15 | Almacenamiento de imágenes | Notion no lo cubre en AS-E1. | ADR-020 (aceptado 15-nov): carpeta del servidor (`MEDIA_DIR`) detrás del puerto `ImageStorage` hasta que se decida el despliegue. | Pendiente de decisión (depende de ADR-012) |

## 3. Qué NO cambia

- Las decisiones estructurales de AS-E1 (monolito modular ADR-001, REST + OpenAPI ADR-002, PostgreSQL + PostGIS ADR-003, PWA con cola offline ADR-010, sesión con cookie ADR-014) coinciden con `DECISIONS.md`.
- Los módulos de `src/modules/` (`catalog`, `comparison`, `establishments`, `identity`, `imports`, `pricing`, `reliability`) corresponden al monolito modular descrito. **No existe `src/modules/commerce`** (ver `as-e5-sistema-integrado.md`).

## 4. Riesgos y decisiones pendientes

| Pendiente | Qué hay que decidir | Referencia |
|---|---|---|
| Fuente única de verdad de los ADR | Si la base de Notion o `docs/adr/` es la vigente; hoy hay estados distintos (ADR-004) y duplicados. | Filas 1 a 3 |
| ADR-012 | Aceptado en `DECISIONS.md` el 16-nov-2026 (Render, Neon, Vercel); el estado en Notion lo confirma el equipo. Sara retiró en su rama `docs/adr-012-sin-confirmar-rda3` (no integrada) el pendiente de confirmar RDA3. | Filas 3, 6 y 7 |
| Nombres canónicos de eventos y diseño de lectura de confiabilidad | Alinear Notion con el repo (o al revés). | Filas 9 y 10 |
| Quién actualiza Notion | AS-E1 no se tocó desde el 9-nov; esta nota no modifica Notion. `PENDIENTE (equipo)`: decidir si se publica una versión 1.1 en Notion. | Todas |

## 5. Lista de verificación del entregable

- [x] Enlace a la versión de Notion de AS-E1.
- [x] Diferencias contrastadas con el repo, cada una con evidencia y tipo.
- [x] Sin copiar ni reescribir AS-E1.
- [ ] Confirmar el recuento actual de ADR en la base de Notion (hay filas duplicadas).
- [ ] Decidir y registrar en Notion las contradicciones abiertas (filas 2, 6, 9 y 10).
- [ ] Revisión y aprobación del equipo.

## 6. Fuentes de referencia

- Notion: AS-E1 `41339c4a-833b-815b-80c1-cec59763ca1d`; Arquitectura y stack `40d39c4a-833b-80ff-a47c-fb7c2d06254e`; índice Entregables `41339c4a-833b-805c-8e67-dbf836cbd348`.
- Repo: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/diagramas/README.md`, `docs/diagramas/12-despliegue.mmd`, `docs/adr/`, `.github/workflows/ci.yml`.
- Guía del proyecto: `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md` (§8 y §9).
