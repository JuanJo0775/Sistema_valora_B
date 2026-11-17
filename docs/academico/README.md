# Documentación académica — Proyecto Nuclear VI (Arquitectura de Software II)

Índice de los entregables de arquitectura de Valora y de dónde vive cada uno. Estado a **2026-11-16**. La guía académica íntegra está en [`guia/Guia_Proyecto_Nuclear_VI_II-2026.md`](guia/Guia_Proyecto_Nuclear_VI_II-2026.md) (copia literal del original).

Notion sigue siendo la fuente de las páginas de entregable que el equipo redacta allí; estos archivos **enlazan, contrastan con el repositorio y marcan brechas**, sin copiar ni reescribir el trabajo existente. La documentación técnica viva está en `docs/adr/`, `docs/diagramas/`, `docs/openapi.yaml` y `docs/ARCHITECTURE.md`.

| Entregable | Corte | Página de Notion | Archivo aquí | Estado |
|---|---|---|---|---|
| AS-E1 Documento de arquitectura v1 | 1 | `41339c4a-833b-815b…` (9-nov) | [as-e1-arquitectura-v1.md](as-e1-arquitectura-v1.md) | Hecho en Notion; fe de erratas con 15 diferencias |
| AS-E2 Registro de ADR | 1 | `41339c4a-833b-819a…` (9-nov) | [as-e2-registro-adr.md](as-e2-registro-adr.md) | Índice de 21 ADR; ADR 0001–0019 migrados a `docs/adr/` desde Notion |
| AS-E3 Núcleo funcional desplegado | 2 | `41339c4a-833b-81e1-aa3d-f9fb61369201` | [as-e3-nucleo-desplegado.md](as-e3-nucleo-desplegado.md) | Borrador de Sara; ADR-012 aceptado y `Dockerfile`/`render.yaml` en `dev` (16-nov); falta la evidencia (URL pública, corrida, capturas): `PENDIENTE (equipo)` |
| AS-E4 Análisis de impacto y arquitectura v2 | 2 | `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c` | [as-e4-impacto-arquitectura-v2.md](as-e4-impacto-arquitectura-v2.md) | Preanálisis; estimación en blanco hasta el 23-nov |
| AS-E5 Sistema integrado | 3 | `41339c4a-833b-816c-bd6d-e8f5e336c144` | [as-e5-sistema-integrado.md](as-e5-sistema-integrado.md) | Checklist de evidencias; el módulo comercial no está implementado; despliegue propuesto en rama, sin integrar ni desplegado |
| AS-E6 Evaluación y documento final | 3 | `41339c4a-833b-81f4-a681-c8360adaddb8` | [as-e6-evaluacion-final.md](as-e6-evaluacion-final.md) | Esqueleto ATAM con lo ya documentado; resto pendiente |

Las diferencias entre Notion, el repositorio y los mensajes del equipo están en [contradicciones-abiertas.md](contradicciones-abiertas.md): qué se resolvió con datos y qué decide el equipo.

## Convenciones

- `PENDIENTE (equipo)`: dato que no se puede determinar con las fuentes. `SUPUESTO:`: lo asumido, con su razón.
- Cada archivo lleva la declaración de uso de IA que usa el equipo en sus entregables.
- Los estados de ADR se copian de Notion; las discrepancias están en [as-e2-registro-adr.md](as-e2-registro-adr.md) y no se corrigen aquí.
- `docs/calidad/` pertenece a Modelos de Calidad y no se toca.
