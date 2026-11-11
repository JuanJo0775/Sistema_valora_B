# Decisiones vigentes — Backend

Fecha de consolidación: 3 de noviembre de 2026.

Este archivo refleja decisiones verificadas en Notion y acuerdos expresos para organizar los dos repositorios. No sustituye los ADR del proyecto.

## Aprobadas

| ID | Decisión | Consecuencia para este repositorio |
|---|---|---|
| ADR-001 | Monolito modular | Un único backend desplegable, separado en módulos de dominio. |
| ADR-002 | REST + JSON + OpenAPI 3.x, HTTPS, versión `/v1` | El contrato de API se mantiene en `docs/api/openapi.yaml`. |
| ADR-010 | PWA con cola persistente para registro sin conexión | El backend debe aceptar reintentos idempotentes; la cola local reside en frontend. |
| ADR-011 | Carga inicial manual; SIPSA como referencia comparable | No construir integración automática completa con SIPSA ni scraping de cadenas en el MVP. |
| ADR-018 | Backend: NestJS sobre Express (aceptado el 8 de noviembre de 2026) | Las reglas de `domain` se escriben en TypeScript puro; su validación práctica es el esqueleto H2-01. |
| ADR-014 | Sesiones administradas por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No sustituir por JWT bearer sin una nueva decisión aprobada. |
| Proyecto | TypeScript como lenguaje principal | Backend desarrollado en TypeScript sobre NestJS (ADR-018). |
| Proyecto | Sin Docker en el MVP | No añadir Dockerfile, Compose ni Testcontainers como requisito. |
| Proyecto | Dos repositorios separados (backend y frontend) | Este repositorio es responsable de API y dominio; el frontend consume su contrato. |

## Pendientes de decisión

| Tema | Estado actual | No asumir |
|---|---|---|
| Persistencia | ADR-003 propuesto | PostgreSQL + PostGIS es candidato, no decisión cerrada. |
| CQRS ligero / outbox | ADR-004 propuesto | No implementar colas ni proyecciones complejas hasta validar necesidad. |
| Modelo TTL y score | ADR-005 propuesto | TTL 7/14 días, corroboración 5 % y umbral de anomalía 40 % son hipótesis/provisionales. |
| Despliegue | ADR-012 en discusión | Proveedor, modelo de servicio y orquestación por definir; confirmar RDA3 con el docente. |
| Herramientas de pruebas y calidad | Jest y Supertest en uso desde H2-01 | SonarQube y el resto del plan de calidad siguen por confirmar. |

## Parámetros aprobados y provisionales

- Detección mínima de anomalías: **80 %** sobre un conjunto etiquetado (aprobado).
- Desviación inicial del 40 % respecto de la mediana: **provisional**, parametrizable y pendiente de calibración.
- Falsos positivos: medir y reportar; no hay umbral máximo independiente aprobado.
- Actualización de precio oficial: máximo 5 minutos (criterio aprobado para EC-02).
- SIPSA: referencia mayorista; nunca presentarlo como precio de una tienda.
- Los reportes sospechosos quedan fuera de la comparación vigente mientras se revisan, pero permanecen en el historial.

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.
