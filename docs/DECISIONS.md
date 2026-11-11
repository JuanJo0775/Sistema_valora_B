# Decisiones vigentes — Backend

Fecha de consolidación: 3 de noviembre de 2026.

Este archivo refleja decisiones verificadas en Notion y acuerdos expresos para organizar los dos repositorios. No sustituye los ADR del proyecto.

## Aprobadas

| ID | Decisión | Consecuencia para este repositorio |
|---|---|---|
| ADR-001 | Monolito modular | Un único backend desplegable, separado en módulos de dominio. |
| ADR-002 | REST + JSON + OpenAPI 3.x, HTTPS, versión `/v1` | El contrato de API se mantiene en `docs/openapi.yaml`. |
| ADR-003 | PostgreSQL + PostGIS (aceptado por el equipo el 3 de noviembre de 2026) | Motor relacional único con PostGIS para cercanía; búsqueda de texto inicial en PostgreSQL (`unaccent`, `pg_trgm`, por validar); reportes de solo inserción; sin motor de búsqueda ni base poliglota en el MVP. La versión se fija en implementación (ver "Versiones fijadas"). |
| ADR-010 | PWA con cola persistente para registro sin conexión | El backend debe aceptar reintentos idempotentes; la cola local reside en frontend. |
| ADR-011 | Carga inicial manual; SIPSA como referencia comparable | No construir integración automática completa con SIPSA ni scraping de cadenas en el MVP. |
| ADR-005 | Vigencia y confiabilidad: TTL por categoría y score ponderado (aceptado el 11 de noviembre de 2026) | Estados vigente, por confirmar (1 a 2 TTL) y desactualizado (más de 2 TTL); score con una función pura. Se acepta el modelo: los valores (7 y 14 días, pesos del score) siguen provisionales y parametrizables hasta calibrarlos. |
| ADR-014 | Sesiones administradas por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No sustituir por JWT bearer sin una nueva decisión aprobada. |
| ADR-015 | Eventos de dominio internos con outbox (aceptado el 11 de noviembre de 2026) | El evento se guarda en la tabla outbox del esquema `shared` en la misma transacción que el cambio; un repartidor del mismo proceso lo entrega al menos una vez y los receptores ignoran repetidos. `PrecioOficialPublicado` se procesa en la misma transacción (EC-02). Sin broker externo. |
| ADR-018 | Backend: NestJS sobre Express (aceptado el 8 de noviembre de 2026) | Las reglas de `domain` se escriben en TypeScript puro; su validación práctica es el esqueleto H2-01. |
| ADR-021 | Acceso a datos: Drizzle ORM con migraciones SQL versionadas (aceptado el 11 de noviembre de 2026) | Tablas en `infrastructure/schema.ts` con un `pgSchema` por módulo; migraciones generadas con `drizzle-kit`, revisadas y versionadas; driver `pg`; solo `infrastructure/` y `shared/database` importan Drizzle. Ver [docs/adr/0021-acceso-datos-drizzle.md](adr/0021-acceso-datos-drizzle.md). |
| Proyecto | TypeScript como lenguaje principal | Backend desarrollado en TypeScript sobre NestJS (ADR-018). |
| Proyecto | Sin Docker en el MVP (registrado dentro de ADR-012, que sigue en discusión) | No añadir Dockerfile, Compose ni Testcontainers; los integrantes no necesitan Docker. **Aclaración del 11 de noviembre de 2026:** la CI de GitHub Actions sí puede usar contenedores de servicio con PostgreSQL + PostGIS para las pruebas. |
| Proyecto | Dos repositorios separados (backend y frontend) | Este repositorio es responsable de API y dominio; el frontend consume su contrato. |

## Pendientes de decisión

| Tema | Estado actual | No asumir |
|---|---|---|
| CQRS ligero (precio vigente precalculado) | ADR-004 propuesto | No implementar proyecciones complejas hasta validar necesidad. El outbox ya no depende de ADR-004: lo decide ADR-015. |
| Valores de vigencia y score | ADR-005 aceptado; valores provisionales | TTL 7/14 días, corroboración 5 % y umbral de anomalía 40 % son hipótesis/provisionales y parametrizables. |
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

## Base de datos (issue #42, decidido el 11 de noviembre de 2026)

Aplicación de ADR-003 y ADR-021. El detalle está en `docs/decisiones/issue-42-base-de-datos/`.

- **Driver:** `pg` (node-postgres), con Drizzle (`drizzle-orm/node-postgres`).
- **Migraciones:**
  - Una sola carpeta `drizzle/` en la raíz, con una secuencia para toda la base.
  - Cada módulo define sus tablas en su `infrastructure/schema.ts`, dentro de su `pgSchema`.
  - La primera migración activa PostGIS.
- **Cuándo se migra:**
  - A mano con `pnpm db:migrate` (en `valora_dev`).
  - Automáticamente antes de las pruebas (en `valora_test`) y en la CI.
  - Nunca al arrancar la API.
- **Protección de las pruebas:** con `NODE_ENV=test` se usa `DATABASE_URL_TEST`, y solo si el nombre de la base termina en `_test`.
- **Sin base no hay API:** si la base no responde al arrancar, la API no inicia. El mensaje muestra host, puerto y base, nunca la contraseña.
- **Límites:** solo `src/shared/database/` y `src/modules/*/infrastructure/` importan `drizzle-orm` o `pg`; `pnpm depcheck` lo verifica.
- **`db:seed`:** llega con la issue #13 (paso 4), cuando haya datos que sembrar.

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.
