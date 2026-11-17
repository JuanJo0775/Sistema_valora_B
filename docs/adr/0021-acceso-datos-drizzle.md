# ADR-021: Acceso a datos con Drizzle ORM y migraciones SQL versionadas

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-03 (integridad), EC-05 (límites de módulo)
- **Requisitos relacionados:** ADR-003, ADR-001, ADR-018, ADR-015
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/415056e5031181c78644c792debc2b65)

## Contexto

ADR-003 fija PostgreSQL + PostGIS con un esquema por módulo. El backend (ADR-018, TypeScript estricto) necesita consultar la base con tipos, crear y cambiar tablas con migraciones SQL versionadas y revisables en Git, y escribir SQL explícito para las consultas geoespaciales (`ST_DWithin`, `geography`). Las reglas del monolito exigen que `domain` no dependa de la librería de base de datos y que cada módulo defina sus tablas en su propia infraestructura.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| SQL a mano con el driver | Control total | Sin tipos; migraciones escritas y ordenadas a mano |
| Prisma | Muy conocido; cliente tipado | Sin soporte directo de PostGIS; esquema en lenguaje propio; migraciones menos controlables |
| TypeORM | Integración clásica con NestJS | Entidades con decoradores que mezclan persistencia y dominio; migraciones frágiles |
| Kysely | Excelente con tipos; cercano al SQL | No genera migraciones |
| **Drizzle ORM** | Esquema en TypeScript; consultas tipadas parecidas a SQL; `drizzle-kit` genera migraciones SQL legibles; `pgSchema` por módulo; SQL directo para PostGIS | Más joven; `geography` necesita un tipo propio |

## Decisión

Drizzle ORM con `drizzle-kit`:

1. Cada módulo define sus tablas en `infrastructure/schema.ts` dentro de su propio `pgSchema`.
2. Las migraciones SQL se generan con `drizzle-kit`, se revisan en el pull request y se versionan en Git. Una migración ya aplicada nunca se edita.
3. Driver inicial: `pg` (node-postgres); se confirma al construir la issue #12.
4. Solo `infrastructure/` y `shared/database` pueden importar `drizzle-orm` o `pg`; dependency-cruiser lo verifica en la CI.
5. Scripts `db:generate`, `db:migrate` y `db:seed`.
6. Prisma queda descartado.

## Consecuencias

- Positivas: errores de columnas detectados al compilar; migraciones legibles y reproducibles en todos los entornos; PostGIS con SQL explícito; límite dominio/infraestructura verificable.
- Negativas / riesgos: herramienta más joven y con menos ejemplos (mitigación: SQL directo cuando haga falta); `geography` definido a mano; cambiar de herramienta después es costoso.

## Verificación

Issue #12: las migraciones corren en `valora_dev`, `valora_test` y la CI; `pnpm depcheck` falla si `domain` o `http/` importan Drizzle.

## Referencias

- Notion: ADR-021, ADR-003, ADR-015.
- Issues / PRs: #12.
