# Decisiones por issue

Registro de trabajo de cada issue que construye una regla o un endpoint. Cada issue tiene su subcarpeta `issue-<número>-<tema>/` con tres archivos:

| Archivo | Qué contiene |
|---|---|
| `grill.md` | Las preguntas que el requisito no respondía, las opciones, la recomendación y lo que decidió el equipo. |
| `contrato-api.md` | Qué cambia en `docs/openapi.yaml` y por qué. Si no cambia nada, se dice. |
| `plan.md` | El plan de implementación: pasos, ciclos TDD, archivos y criterio de terminado. |

La subcarpeta entra en el mismo pull request que el código de la issue.

- **Fuente de verdad:** los requisitos (RF/RNF), escenarios y ADRs viven en Notion.
- **Decisiones grandes:** las que son difíciles de revertir van en un ADR (`docs/adr/` y la base ADRs de Notion).
- **Resumen:** `docs/DECISIONS.md` resume las decisiones vigentes.
- **Esta carpeta:** guarda el detalle de cómo se aplicaron en cada issue.
