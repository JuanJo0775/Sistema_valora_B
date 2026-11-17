# AS-E3 · Núcleo funcional desplegado — enlace y brechas

> **Entregable 3 de Arquitectura de Software II · Corte 2.** Registro y comparación de precios de punta a punta, despliegue reproducible (proveedor y modelo justificados en un ADR) y API documentada (Guía §8 Fase 3, §9 Corte 2).
>
> **El contenido del entregable vive en Notion** (página `41339c4a-833b-81e1-aa3d-f9fb61369201`, borrador del 16-nov), donde lo está redactando Sara Valentina Sánchez Estrada. Este archivo **no lo copia ni lo reescribe**: enlaza lo que existe y deja constancia de lo que el repositorio permite verificar y de lo que falta.
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Qué cubre el borrador de Notion

Según el resumen que Sara dio a JuanJo el 16-nov (mensaje, no verificado contra la página):

- Módulos construidos, 4 flujos de punta a punta con su evidencia, rutas del OpenAPI y pruebas.
- Cifras citadas: backend 753 pruebas en verde, frontend 295 en verde, 33 rutas del OpenAPI.
- Falta, según ella: **el despliegue** (sin Dockerfile, sin proveedor, sin URL pública). Dejó la lista de pasos para cerrarlo, empezando por aceptar ADR-012.

## 2. Contraste con el repositorio (2026-11-16)

| Punto | Notion / mensaje de Sara | Verificado en el repo | Estado |
|---|---|---|---|
| Rutas del OpenAPI | 33 | `docs/openapi.yaml` en `dev`: 33 rutas y 33 operaciones (4 de `/commerce/*` con `x-corte: 3`) | Resuelta: coincide. Un conteo previo (32) se hizo antes de integrar la canasta básica (`GET /v1/featured-products`, PR #122) |
| Pruebas backend | 753 | 753 en 111 suites (ejecución local 2026-11-16) | Coincide |
| Pruebas frontend | 295 | `dev` (`cdcf81f`): 295. La rama `feat/despliegue-vercel` suma 3 (`src/vercelConfig.spec.ts`): 298 | Resuelta: coincide con `dev`. Un conteo previo (278) era anterior a los PR #62 y #63 |
| Pruebas backend (ramas de despliegue) | — | 795/795 en `feat/despliegue-iac` (sin integrar) | Dato de rama |
| Dockerfile / render.yaml | No existen | **Actualizado en `dev` el 16-nov:** `Dockerfile` en etapas y `render.yaml` existen en B (PR #123). Sin job de despliegue en `dev` | Desactualizado el mensaje de Sara |
| Despliegue: TRUST_PROXY, Terraform Neon, `deploy.yml`, `infra.yml`, `keepalive.yml`, `docs/despliegue.md`, `vercel.json` (F) | — | Propuesto en rama (`feat/despliegue-iac` en B, `feat/despliegue-vercel` en F), sin integrar; Terraform validado con `terraform validate`, no aplicado | Propuesto en rama, sin integrar |
| Semilla | — | `pnpm seed:imagenes` (Sara, PR #124: enlaces de fotos de Open Food Facts a `seed/productos.csv`); `pnpm db:seed` en local; en producción solo por el workflow «Despliegue» con la casilla «Cargar la semilla» (`docs/despliegue.md` §3, en rama) | Parcial |
| Smoke | — | `pnpm smoke` existe en B (modo `--solo-lectura` para un despliegue); fuera de CI «hasta que exista el despliegue» | Hecho parcial |
| E2E de navegador | Playwright pendiente (nota de MC-E3) | No hay; la carpeta `e2e/` que F anuncia (#27) no existe | Pendiente |
| ADR-012 | «Decidido el 15-nov» (AS-E3) | `DECISIONS.md`: aceptado el 16-nov-2026 (Render, Neon, Vercel; PR #123). Propiedad de Notion no verificada de nuevo; `docs/adr/0012-despliegue-reproducible.md` conserva el estado copiado. Sara retiró el pendiente de RDA3 en su rama `docs/adr-012-sin-confirmar-rda3` (no integrada) | Actualizado en `dev` el 16-nov |
| Diagrama de despliegue | — | `docs/diagramas/12-despliegue.mmd` dice «Sin Docker en el MVP» | Desactualizado |

Fuentes: resumen de despliegue y E2E del 16-nov (hallazgos de lectura de código), `docs/openapi.yaml`, `docs/diagramas/12-despliegue.mmd`, `docs/adr/0012-despliegue-reproducible.md`.

## 3. Flujos de punta a punta y qué pruebas los cubren

| Flujo | Backend | Frontend |
|---|---|---|
| Registrar precio | `reports-http`, `burst-e2e`, `offline-sync` (Supertest con PostGIS) | `ReportPrice.spec.tsx`, `reportQueue`, `PendingReports` |
| Comparar precios | `comparison-http` (tres casos «de punta a punta»), `comparison-*.spec` | `ComparePrices.spec.tsx` |

Son pruebas de integración con la API y componentes, **no** pruebas de navegador contra un despliegue real. Los 4 flujos que cita Sara están en su página de Notion; aquí solo se listan los dos que se pudieron contrastar con archivos.

## 4. Brechas que impiden dar el entregable por cerrado

1. **Despliegue reproducible**: ADR-012 ya figura aceptado en `DECISIONS.md` (16-nov); falta una sola fuente de verdad de su estado entre Notion y el repo (`PENDIENTE (equipo)`).
2. Lo que ya existe en `dev`: `Dockerfile` y `render.yaml`. Propuesto en rama, sin integrar: job de despliegue (`deploy.yml`), `infra/neon/`, `TRUST_PROXY`, runbook `docs/despliegue.md`, `vercel.json` (F). Falta integrarlo y ejecutarlo.
3. Reconciliar `12-despliegue.mmd` (aún dice «Sin Docker en el MVP»).
4. Ejecutar el smoke contra el despliegue y subir la evidencia (ver sección «Evidencia pendiente»).
5. Actualizar `API_CONTRACT.md` (dice que el contrato no está incorporado, pero `openapi.yaml` existe).

## Evidencia pendiente

La checklist de Sara en Notion (AS-E3, 16-nov) incluye, sin marcar, el ítem «Evidencia: URL pública, registro de la corrida del despliegue y captura del registro y la comparación funcionando». Es la evidencia que exige AS-E3 (y AS-E5): sin ella el entregable no está completo. Nada está desplegado todavía.

| Evidencia exigida | Estado |
|---|---|
| URL pública | `PENDIENTE (equipo)` |
| Registro de la corrida del despliegue (workflow «Despliegue») | `PENDIENTE (equipo)` |
| Captura del registro y la comparación funcionando | `PENDIENTE (equipo)` |

## 5. Riesgos y decisiones pendientes

- El proveedor no está decidido; no se asume ninguno. `SUPUESTO:` el frontend iría en Vercel porque su documentación habla de una «regla de Vercel», pero no hay `vercel.json`.
- Las cifras de pruebas cambian con cada merge; conviene fijar el commit al que se refieren.

## 6. Fuentes de referencia

- Notion: AS-E3 `41339c4a-833b-81e1-aa3d-f9fb61369201`; ADR-012 en la base ADRs.
- Repo: `docs/openapi.yaml`, `docs/adr/0012-despliegue-reproducible.md`, `docs/diagramas/12-despliegue.mmd`, `docs/academico/as-e2-registro-adr.md`, `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md`.
