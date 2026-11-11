# Plan — issue #42: conexión con Drizzle y migraciones

- **Objetivo:** la API se conecta a PostgreSQL + PostGIS con Drizzle y el driver `pg`; las migraciones SQL se generan, se versionan y se aplican en `valora_dev`, `valora_test` y la CI.
- **Relación:** issue padre #12, épica #9, ADR-003, ADR-021, ADR-012 (aclaración CI), EC-03, EC-05.
- **Fuera de alcance:**
  - Tablas de negocio (llegan por módulo).
  - La tabla outbox (#43).
  - `db:seed` (#13).
  - Comprobar la base en `/v1/health`.

## Dependencias nuevas (se piden con este plan)

| Paquete | Tipo | Para qué |
|---|---|---|
| `drizzle-orm` | producción | ORM (ADR-021) |
| `pg` | producción | driver (grill, pregunta 1) |
| `drizzle-kit` | desarrollo | generar y aplicar migraciones |
| `@types/pg` | desarrollo | tipos del driver |

## Rama y pull request

`feat/shared-database`, que sale de `dev`. Un pull request hacia `dev` con `Closes #42`.

## Diseño

- **`src/shared/database/database-url.ts`:** función pura que elige la URL.
  - Con `NODE_ENV=test` usa `DATABASE_URL_TEST`.
  - En los demás entornos usa `DATABASE_URL`.
  - En pruebas rechaza una base cuyo nombre no termine en `_test`, y el mensaje nombra la base.
- **`src/shared/database/database.module.ts`:** módulo global de NestJS.
  - Crea el pool de `pg` y la instancia de Drizzle, y la expone con un token (`DATABASE`).
  - Al arrancar hace `SELECT 1`. Si falla, la API no arranca y el mensaje dice host, puerto y base, sin la contraseña.
  - Al cerrar la aplicación, cierra el pool para que Jest y el proceso terminen limpio.
- **Migraciones:**
  - Configuración en `drizzle.config.ts` (raíz), con el esquema `src/**/infrastructure/schema.ts` y la salida en `drizzle/`.
  - Primera migración, escrita a mano con `drizzle-kit generate --custom`: `CREATE EXTENSION IF NOT EXISTS postgis;`.
- **Scripts:**
  - `db:generate`: genera una migración desde los esquemas.
  - `db:migrate`: aplica las pendientes en la base de `DATABASE_URL`, leyendo `.env`.
- **Pruebas:**
  - Jest aplica las migraciones en `valora_test` antes de correr (`globalSetup`), con la misma protección `_test`.
  - Las pruebas de integración que levantan `AppModule` (health y errores) ahora necesitan la base de pruebas.
- **CI:** el job `Pruebas` levanta el contenedor de servicio `postgis/postgis:17-3.6` (usuario y base de prueba) y exporta `DATABASE_URL_TEST`.
- **Reglas de dependencia:** nueva regla en `.dependency-cruiser.cjs`. Solo `src/shared/database/` y `src/modules/*/infrastructure/` pueden importar `drizzle-orm` o `pg`.

## Ciclos TDD

Cada ciclo es un commit `test(shared)` (rojo) y otro `feat(shared)` (verde), más un `refactor` si hace falta.

1. En desarrollo, la conexión usa `DATABASE_URL`.
2. En pruebas, usa `DATABASE_URL_TEST`.
3. En pruebas, rechaza una base que no termina en `_test`, con un mensaje que la nombra.
4. Con la base de pruebas migrada, Drizzle consulta PostGIS (`postgis_lib_version()`), por integración.
5. La API no arranca si la base no responde (por ejemplo, el puerto 1), y el mensaje dice host, puerto y base, pero no la contraseña.

Después:

6. La regla de `depcheck` se verifica con archivos temporales que la violan (no se suben), como en la #10.
7. **CI:** el contenedor de servicio en el job `Pruebas`. Commit `ci`.
8. **Documentación:**
   - README: crear el usuario `valora` (faltaba), `pnpm db:migrate` y `\pset pager off` en psql.
   - `DECISIONS.md`: carpeta única de migraciones y driver `pg`.
   - La regla local `arquitectura-monolito-modular.md`: las migraciones van en `drizzle/`.
   - Esta carpeta de decisiones.
9. **Issues en GitHub (te muestro el texto antes):** quitar `db:seed` de la #42 y agregarlo a la #13.

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- `pnpm db:migrate` aplica la migración en `valora_dev`, y Jest la aplica en `valora_test`.
- `GET /v1/health` sigue respondiendo `{ "status": "ok" }` con la base encendida.

## Notion

- **[EPIC-B00]:** la fila 3b (#42) pasa a «PR abierto…» y luego a «Terminado…».
