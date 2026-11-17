# AS-E5 · Sistema integrado — checklist de evidencias

> **Entregable 5 de Arquitectura de Software II · Corte 3 (40 %).** Núcleo y módulo comercial integrados y desplegados, con demostración funcional (Guía §9, «Corte 3»). AS-E5 es **implementación**, no un documento: este archivo es el **checklist de evidencias a reunir** y el estado verificado a 2026-11-16. No contiene resultados: todo lo que no existe aparece como `PENDIENTE (equipo)`. La página de Notion `41339c4a-833b-816c-bd6d-e8f5e336c144` sigue como página base sin desarrollo (última edición 9-nov).
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Qué exige la guía

Fuente: Guía §9 (Corte 3, entregable 5), §8 Fase 4 (evolución del producto) y §8.1 (mínimos: despliegue reproducible, pruebas automatizadas con TDD en reglas de negocio, historial Git de todos los integrantes). La guía no fija el mecanismo de despliegue; lo decide el equipo y lo documenta en un ADR (§8 Fase 3). Corte 3 pesa 40 % y se valora la coherencia entre escenarios, decisiones y evidencia (§10).

## 2. Estado actual verificado (repo, 2026-11-16)

### 2.1 Módulo comercial

| Elemento | Qué existe | Evidencia |
|---|---|---|
| Contrato API | Solo la **declaración** de 4 rutas: `/commerce/claims` (POST, RF-015), `/commerce/prices` (PUT, RF-016, EC-02), `/commerce/prices/bulk` (POST CSV, RF-016, ADR-016) y `/commerce/promotions` (POST, RF-017, EC-06), todas con `x-corte: 3`. Las respuestas están descritas de forma mínima (202, 200/403, 202, 201). | `docs/openapi.yaml`, líneas 1293 a 1370 |
| Código del módulo | **No existe `src/modules/commerce`.** Módulos presentes: `catalog`, `comparison`, `establishments`, `identity`, `imports`, `pricing`, `reliability`. | `ls src/modules` |
| Preparación en el núcleo | La respuesta de comparación ya trae el campo `promotions` como arreglo vacío fijo (`promotions: []`). El historial anota que «por ahora todos los precios son reportados; commerce agregará…». La función de orden neutral tiene un caso de prueba con `verifiedCommerce`. | `src/modules/comparison/application/compare-product.ts` (líneas 113 y 215), `comparison.response.ts` (32 y 72), `price-history.ts` (línea 12), `src/domain/neutral-ranking.spec.ts` (línea 206) |
| Requisitos | RF-015 a RF-018 en estado «Por definir» en Notion; RF-019 opcional y fuera del MVP. | Lectura de Notion del 16-nov |
| Análisis de impacto | Preanálisis en AS-E4 de Notion; el análisis oficial es posterior a la presentación del docente (H2-05, 23-nov). | Delta de Notion del 16/17-nov |

Conclusión: el módulo comercial **no está implementado**. Lo verificable es la reserva de espacio en el contrato y en la respuesta de comparación.

### 2.2 Despliegue (hueco principal)

| Elemento | Estado | Evidencia |
|---|---|---|
| Dockerfile / render.yaml | Actualizado en `dev` el 16-nov: `Dockerfile` en etapas y `render.yaml` existen en B (PR #123). Compose y `.dockerignore` no verificados. Frontend: `vercel.json` propuesto en `feat/despliegue-vercel` (F), sin integrar. | Archivos del repo; `DECISIONS.md` |
| ADR-012 como archivo | Existe copiado de Notion en `docs/adr/0012-despliegue-reproducible.md`. `DECISIONS.md` lo registra aceptado el 16-nov-2026 (Render, Neon, Vercel). | `docs/adr/` (solo plantilla, 0020 y 0021), `docs/DECISIONS.md` líneas 24 y 32 |
| Proveedor y modelo de servicio | Decidido en ADR-012 (16-nov): Render + Neon + Vercel. El diagrama 12 sigue diciendo «proveedor por definir» y «Sin Docker en el MVP» (desactualizado). Infraestructura como código (`infra/neon/`, Terraform validado, no aplicado) propuesta en rama, sin integrar. | `docs/diagramas/12-despliegue.mmd`; README del frontend |
| CD | La CI en `dev` tiene `calidad`, `pruebas` y `sonarqube`; **no hay job de despliegue en `dev`**. `deploy.yml` (migra Neon y dispara Render, con carga opcional de semilla), `infra.yml` y `keepalive.yml` están propuestos en `feat/despliegue-iac`, sin integrar ni ejecutados. | `.github/workflows/ci.yml` |
| Prueba de humo | Existe `test/smoke/smoke.ts` (`pnpm smoke`, con modo `--solo-lectura`), pero **no corre en la CI** ni hay URL que probar: «Fuera por ahora: correrla en la CI. Entra cuando exista el despliegue (ADR-012)». | `README.md` (sección «Prueba de humo»), `docs/DECISIONS.md` línea 461 |
| E2E con navegador | No existe en backend ni frontend; los archivos `*-e2e.spec.ts` del backend son pruebas de integración con Supertest sobre la base real. | `test/integration/burst-e2e.spec.ts`, `appeal-e2e.spec.ts` |
| Runbook, entornos, respaldos, monitoreo | Runbook `docs/despliegue.md` propuesto en rama, sin integrar; respaldos y monitoreo sin evidencia. Variables `SESSION_SECRET`, `REPORTER_KEY_SECRET`, `PORT` y `OUTBOX_*` «reservadas para el despliegue (#23)». | README del backend; `docs/decisiones/` no tiene carpeta de la #23 |
| Imágenes de productos | `MEDIA_DIR` (carpeta del servidor) en `dev`. ADR-022 (Propuesto, en rama, sin integrar) lleva las fotos del moderador a Supabase Storage porque el disco de Render es efímero. | ADR-020, `docs/decisiones` |

### 2.3 Pruebas existentes que servirán de base (no son evidencia de AS-E5)

- Integración con PostGIS en la CI (`pruebas`) y análisis estático en `sonarqube`. Las cifras de cobertura que aparecen en Notion (MC-E3) no se repiten aquí porque no se midieron en esta tarea.
- Mediciones puntuales de calidad en `docs/calidad/` (sincronización EC-07, anómalos EC-03, autorización y privacidad EC-08); sirven como referencia, no como resultado de AS-E5.

## 3. Checklist de evidencias a reunir

Cada casilla se marca solo cuando exista la evidencia enlazada. Nada se declara cumplido por adelantado.

### 3.1 Núcleo y módulo comercial integrados

- [ ] Análisis de impacto con fecha previa al primer commit de `commerce` (entrada: AS-E4; presentación del docente, H2-05, 2026-11-23). `PENDIENTE (equipo)`.
- [ ] Módulo `commerce` implementado con límites propios (RF-015 a RF-018) y sin dependencias del núcleo hacia él (medida de EC-05; verificación con la herramienta de dependencias que el equipo elija, `PENDIENTE (equipo)`).
- [ ] OpenAPI actualizado: las 4 rutas con esquemas y respuestas reales, sin la marca «preliminar».
- [ ] `promotions` de la comparación alimentado desde `commerce`, con orden idéntico con y sin promociones (EC-06).
- [ ] Precio oficial visible en la comparación dentro del límite de EC-02 (50 cambios medidos). `PENDIENTE (equipo)`: no hay medición.
- [ ] Reglas de integración oficial/reportada (RF-018) con pruebas.
- [ ] Decisión sobre RF-019 (alertas): confirmar que sigue fuera del MVP.

### 3.2 Despliegue reproducible

- [ ] ADR-012 aceptado y escrito en `docs/adr/` (aceptado en `DECISIONS.md` el 16-nov-2026 y copiado en `docs/adr/`; falta alinear el estado de Notion).
- [ ] `Dockerfile` del backend: existe en `dev` (16-nov). Frontend: `vercel.json` en `feat/despliegue-vercel` (F), sin integrar.
- [ ] Base PostgreSQL + PostGIS en el entorno de despliegue y migraciones aplicadas por el pipeline.
- [ ] Job de despliegue en la CI que corra solo si pasan las demás comprobaciones (RNF-009, meta propuesta ≤ 30 min).
- [ ] URL pública, registro de la corrida del despliegue y captura del registro y la comparación funcionando (ítem de la checklist de Sara en AS-E3; sin esta evidencia el entregable no está completo): `PENDIENTE (equipo)`.
- [ ] Prueba de humo contra el entorno desplegado (`pnpm smoke --solo-lectura` con `SMOKE_URL`).
- [ ] Cookie de sesión con el mismo origen o configuración equivalente (ADR-014).

### 3.3 Pruebas de integración

- [ ] Pruebas de integración del módulo comercial (autorización por rol, verificación de comercio antes de publicar, historial de cambios).
- [ ] Pruebas E2E de registro y comparación sobre el sistema desplegado. `PENDIENTE (equipo)`: hoy no existen.
- [ ] Actualización de la matriz de autorización con el rol de comercio (`docs/calidad/matriz-autorizacion.md` solo como referencia de la medición actual).

### 3.4 Demostración funcional

- [ ] Guion de demostración (registrar precio, comparar, comercio publica precio oficial y promoción, moderación).
- [ ] Evidencia (grabación o capturas) y fecha. `PENDIENTE (equipo)`.
- [ ] Historial Git con el aporte de todos los integrantes (Guía §8.1); el equipo debe revisarlo antes de la sustentación.

## 4. Riesgos y decisiones pendientes

| Riesgo o decisión | Detalle | Fuente |
|---|---|---|
| Sin despliegue no hay AS-E5 | Notion AS-E3 aplica el mismo criterio: «No se declara desplegado hasta tener la URL y la prueba de humo». | AS-E3 (Notion) |
| Diagrama 12 desactualizado | `Dockerfile` y `render.yaml` ya existen en `dev` (16-nov); el diagrama 12 aún dice «Sin Docker en el MVP». | `as-e1-arquitectura-v1.md`, fila 6 |
| Carga de EC-04 y disponibilidad RNF-011 | Dependen del hosting elegido en ADR-012. | EC-04 y RNF-011 en Notion |
| Tiempo | El análisis oficial de impacto se hace el 23-nov y el módulo debe integrarse en el corte 3. `PENDIENTE (equipo)`: plan y responsables. | Delta de Notion |

## 5. Lista de verificación del entregable

- [x] Estado real del módulo comercial contrastado con `openapi.yaml` y `src/`.
- [x] Huecos de despliegue identificados con evidencia.
- [ ] Núcleo y módulo comercial integrados.
- [ ] Despliegue reproducible.
- [ ] Pruebas de integración.
- [ ] Evidencia de demostración funcional.
- [ ] Revisión y aprobación del equipo.

## 6. Fuentes de referencia

- Guía: `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md` (§8, §8.1, §9, §10).
- Repo: `docs/openapi.yaml`, `docs/DECISIONS.md`, `docs/diagramas/12-despliegue.mmd`, `.github/workflows/ci.yml`, `test/smoke/smoke.ts`, `src/modules/`.
- Notion: AS-E3 `41339c4a-833b-81e1-aa3d-f9fb61369201`, AS-E4 `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`, AS-E5 `41339c4a-833b-816c-bd6d-e8f5e336c144`; RF-015 a RF-019; EC-02, EC-05 y EC-06; RNF-009 y RNF-011.
