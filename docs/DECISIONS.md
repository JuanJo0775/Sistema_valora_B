# Decisiones vigentes — Backend

Fecha de consolidación: 3 de noviembre de 2026.

Este archivo refleja decisiones verificadas en Notion y acuerdos expresos para organizar los dos repositorios. No sustituye los ADR del proyecto.

## Aprobadas

| ID | Decisión | Consecuencia para este repositorio |
|---|---|---|
| ADR-001 | Monolito modular | Un único backend desplegable, separado en módulos de dominio. |
| ADR-002 | REST + JSON + OpenAPI 3.x, HTTPS, versión `/v1` | El contrato de API se mantiene en `docs/openapi.yaml`. |
| ADR-010 | PWA con cola persistente para registro sin conexión | El backend debe aceptar reintentos idempotentes; la cola local reside en frontend. |
| ADR-011 | Carga inicial manual; SIPSA como referencia comparable | No construir integración automática completa con SIPSA ni scraping de cadenas en el MVP. |
| ADR-014 | Sesiones administradas por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No sustituir por JWT bearer sin una nueva decisión aprobada. |
| ADR-018 | Backend: NestJS sobre Express (aceptado el 8 de noviembre de 2026) | Las reglas de `domain` se escriben en TypeScript puro; su validación práctica es el esqueleto H2-01. |
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

## Versiones fijadas del entorno (H2-01, paso 1)

Estas versiones se fijaron al configurar el backend. ADR-018 decide el framework pero no fija la versión mayor, y PLAN_MAESTRO indica que la versión exacta de PostgreSQL se fija en implementación. Cambiar una de estas versiones requiere revisar su razón.

| Herramienta | Versión | Razón |
|---|---|---|
| NestJS | 11 (`@nestjs/*` ^11, `@nestjs/config` ^4) | NestJS 12 se publica solo como ESM y Jest no lo carga en un proyecto CommonJS (`Must use import to load ES Module` al importar `@nestjs/testing`). NestJS 11 sigue en CommonJS y funciona con Jest y ts-jest sin configuración extra. Revisar si el proyecto se migra a ESM. |
| TypeScript | 6 | TypeScript 7.0 trae solo el ejecutable `tsc`, sin la API programática que necesita el CLI de Nest (`nest build`); según el propio CLI, esa API vuelve en 7.1. TypeScript 6 exige declarar `rootDir` en `tsconfig.build.json`. |
| Validación de variables de entorno | `class-validator` + `class-transformer` | Se eligió frente a `zod`. ADR-018 y las reglas de API ya usan `class-validator` con `ValidationPipe` para los DTOs, así que no se agrega una segunda librería de validación. `@nestjs/config` acepta la función `validate` y `class-transformer` convierte `PORT` a número. |
| PostgreSQL | 17 | Es la versión instalada en el entorno de desarrollo del equipo. Aún no se usa: la base llega en el paso 3 del H2-01 (Drizzle). PostGIS está pendiente de instalar. El motor sigue sujeto a ADR-003. |

## Parámetros aprobados y provisionales

- Detección mínima de anomalías: **80 %** sobre un conjunto etiquetado (aprobado).
- Desviación inicial del 40 % respecto de la mediana: **provisional**, parametrizable y pendiente de calibración.
- Falsos positivos: medir y reportar; no hay umbral máximo independiente aprobado.
- Actualización de precio oficial: máximo 5 minutos (criterio aprobado para EC-02).
- SIPSA: referencia mayorista; nunca presentarlo como precio de una tienda.
- Los reportes sospechosos quedan fuera de la comparación vigente mientras se revisan, pero permanecen en el historial.

## Precio por unidad base (RF-004, decidido por el equipo el 11 de noviembre de 2026)

Precisiones a RF-004 tomadas al construir la regla en `src/domain/unit-price.ts` (issue #11):

- **Se muestra por 100 g, 100 ml o unidad**, como dice RF-004. El contrato (`unitPrice.per`) pasa de `kg`/`l`/`und` a `100g`/`100ml`/`und`.
- **Unidades de entrada:** `g`, `kg`, `ml`, `l` y `und`. `kg` y `l` se convierten a `g` y `ml` (×1000); los empaques se expanden (6 × 330 ml = 1980 ml).
- **Redondeo:** el precio mostrado se redondea al peso entero con la mitad hacia arriba ($1.333,33 → $1.333). Comparar y ordenar usa siempre el valor exacto, para que dos precios que se muestran iguales no empaten por el redondeo.
- **Aritmética exacta sin dependencias:** las cantidades decimales se leen como fracción de enteros (`bigint`), porque la coma flotante altera valores como 1,005 kg. `domain` no importa paquetes externos.
- **Precio de entrada:** entero en pesos mayor o igual a $1, como `priceCop` en el contrato.
- ADR-007 (catálogo con unidad base) sigue **propuesto**; esta regla no depende de cómo se guarde el catálogo.

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.
