# Valora — Backend

API y lógica de negocio de **Valora**, plataforma colaborativa para comparar precios entre tiendas de barrio, minimercados y supermercados de Armenia y el Quindío.

> Este repositorio contiene el backend. El frontend vive en [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F).

## Estado

<badge>Configuración inicial (H2-01, paso 1)</badge>

- Lenguaje aprobado: TypeScript.
- Estilo aprobado: monolito modular.
- API aprobada: REST sobre HTTPS, JSON y contrato OpenAPI 3.x bajo `/v1`.
- Decisiones aceptadas: sesiones administradas por servidor, PWA con registro offline-first y carga inicial manual con SIPSA solo como referencia comparable.
- Framework: NestJS sobre Express (ADR-018, aceptado).
- Persistencia: PostgreSQL + PostGIS (ADR-003, aceptado).
- Acceso a datos: Drizzle ORM con migraciones SQL (ADR-021, aceptado). Eventos internos con outbox (ADR-015, aceptado).
- Pendiente: precio vigente precalculado (ADR-004) y mecanismo de despliegue reproducible (ADR-012).
- Docker no forma parte del MVP ni del desarrollo local; solo la CI usa contenedores de servicio de PostgreSQL + PostGIS para las pruebas.

El proyecto tiene la configuración base y una sola ruta, `GET /v1/health`. No hay todavía módulos de negocio, persistencia ni despliegue.

## Responsabilidades

- Identidad, autenticación, sesiones y autorización RBAC.
- Catálogo de productos y presentaciones.
- Directorio y geolocalización de establecimientos.
- Registro e historial de reportes de precios.
- Reglas de confiabilidad, detección de anomalías y moderación.
- Consulta y comparación de precios.
- Carga semilla manual y referencias SIPSA.
- Módulo comercial del Corte 3, según el alcance aprobado.

## Requisitos

| Herramienta | Versión                                         | Dónde conseguirla                                                                                              |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Git         | cualquiera reciente                             | <https://git-scm.com/downloads>                                                                                |
| Node.js     | 22 LTS (ver `.nvmrc`)                           | <https://nodejs.org/en/download> (elige la versión 22 LTS)                                                     |
| pnpm        | 10.18.3 (fijada en `packageManager`)            | Viene con Node a través de `corepack`; no se instala aparte                                                    |
| PostgreSQL  | 17 (ver `docs/DECISIONS.md`, versiones fijadas) | <https://www.postgresql.org/download/>                                                                         |
| PostGIS     | la que corresponda a PostgreSQL 17              | En Windows: al terminar el instalador de PostgreSQL se abre **Stack Builder** → _Spatial Extensions_ → PostGIS |

PostgreSQL y PostGIS todavía no se usan: llegan con el paso 3 del H2-01 (Drizzle). Se pueden instalar desde ya.

Comprueba las versiones:

```bash
git --version
node -v          # debe empezar por v22
corepack --version
```

## Instalación

Clona el repositorio y trabaja siempre desde la rama `dev`:

```bash
git clone https://github.com/JuanJo0775/Sistema_valora_B.git
cd Sistema_valora_B
git switch dev
```

El proyecto fija la versión de pnpm en `packageManager` (pnpm 10.18.3) y se usa a través de corepack, que viene con Node 22. No instales otra versión de pnpm de forma global.

```bash
corepack enable
pnpm install
cp .env.example .env
```

**Nota para Windows:** `corepack enable` crea accesos directos dentro de la carpeta de instalación de Node (en `Program Files`) y falla con `EPERM` si la terminal no es de administrador. Alternativa sin permisos de administrador:

```bash
corepack prepare pnpm@10.18.3 --activate
corepack pnpm install     # anteponer "corepack" a cada comando: corepack pnpm test, corepack pnpm lint, etc.
```

En esta guía `pnpm <comando>` equivale a `corepack pnpm <comando>` si no pudiste ejecutar `corepack enable`.

## Crear las bases de datos

Con PostgreSQL en marcha, desde `psql` con un usuario con permisos de creación (por ejemplo `postgres`):

**Nota para Windows:** el instalador no agrega `psql` al PATH. Abre **SQL Shell (psql)** desde el menú de inicio, o agrega `C:\Program Files\PostgreSQL\17\bin` a la variable de entorno `Path` y abre una terminal nueva. Si el servicio está detenido, inícialo en **Servicios** (`postgresql-x64-17`).

```sql
CREATE ROLE valora LOGIN PASSWORD 'valora';
CREATE DATABASE valora_dev OWNER valora;
CREATE DATABASE valora_test OWNER valora;
\c valora_dev
CREATE EXTENSION IF NOT EXISTS postgis;
\c valora_test
CREATE EXTENSION IF NOT EXISTS postgis;
\pset pager off
SELECT postgis_full_version();
```

- El usuario `valora` con contraseña `valora` es el de `.env.example` y es solo para el equipo local.
- `CREATE EXTENSION` lo ejecuta `postgres`, porque `valora` no es superusuario.
- La última consulta debe mostrar `POSTGIS="3.x…"`.
- `\pset pager off` evita el error «"more" no se reconoce como un comando» de la consola de Windows.

**Si Stack Builder se cuelga al descargar PostGIS,** usa el instalador directo de <https://download.osgeo.org/postgis/windows/pg17/> (`postgis-bundle-pg17x64-setup-3.x.x-1.exe`). Al instalar, desmarca «Create spatial database».

Después aplica las migraciones en la base de desarrollo:

```bash
pnpm db:migrate
```

Las pruebas aplican solas las migraciones en `valora_test` antes de correr, y se niegan a usar una base cuyo nombre no termine en `_test`. Por eso **PostgreSQL debe estar encendido para correr `pnpm test`**. La API tampoco arranca si la base no responde.

## Variables de entorno

Se validan al arrancar: si falta alguna o es inválida, la aplicación no inicia y el mensaje nombra la variable.

| Variable                  | Descripción                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                    | Puerto HTTP (entero).                                                                 |
| `NODE_ENV`                | `development`, `test` o `production`.                                                 |
| `DATABASE_URL`            | Conexión a la base de desarrollo.                                                     |
| `DATABASE_URL_TEST`       | Conexión a la base de pruebas.                                                        |
| `SESSION_SECRET`          | Secreto de la sesión; usa un valor propio y aleatorio.                                |
| `OUTBOX_POLL_INTERVAL_MS` | Cada cuántos milisegundos el repartidor revisa la bandeja de eventos (inicial: 5000). |
| `OUTBOX_MAX_ATTEMPTS`     | Intentos de entrega antes de marcar un evento como fallido (inicial: 5).              |

`.env` no se sube al repositorio; el ejemplo está en `.env.example`.

## Comprobar que todo quedó bien

```bash
pnpm test        # todas las pruebas deben pasar
pnpm dev         # arranca la API en http://localhost:3000
```

Con la API en marcha, abre <http://localhost:3000/v1/health> en el navegador. Debe responder `{"status":"ok"}`. Si la API no arranca, el mensaje de error nombra la variable de entorno que falta o es inválida.

## Comandos

| Comando                             | Qué hace                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`                          | Arranca la API en modo observación.                                            |
| `pnpm build` / `pnpm start`         | Compila a `dist/` y arranca la versión compilada.                              |
| `pnpm test` / `pnpm test:watch`     | Corre las pruebas (Jest).                                                      |
| `pnpm test:cov`                     | Pruebas con cobertura en `coverage/`.                                          |
| `pnpm typecheck`                    | Verifica tipos con TypeScript estricto.                                        |
| `pnpm lint`                         | ESLint con reglas estrictas de TypeScript.                                     |
| `pnpm format` / `pnpm format:check` | Prettier.                                                                      |
| `pnpm depcheck`                     | Reglas de dependencia del monolito modular (dependency-cruiser).               |
| `pnpm db:generate`                  | Genera una migración en `drizzle/` a partir de los `schema.ts` de los módulos. |
| `pnpm db:migrate`                   | Aplica las migraciones pendientes en la base de `DATABASE_URL` (lee `.env`).   |

La CI corre en cada pull request hacia `dev` o `main`, con dos jobs: `Calidad` (`typecheck`, `lint`, `format:check`, `depcheck` y `build`) y `Pruebas` (`test:cov --ci`, con un contenedor de PostgreSQL + PostGIS). Si una sola verificación falla, no se mezcla.

## Estructura

```text
docs/                  Decisiones (adr/, decisiones/), arquitectura, contrato OpenAPI y épicas
drizzle/               Migraciones SQL de toda la base (una sola secuencia)
src/
  main.ts              Arranque
  app.module.ts        Módulo raíz
  app.setup.ts         Configuración común (prefijo /v1, validación y filtro de errores)
  health/              GET /v1/health
  domain/              Reglas puras: precio por unidad y vigencia
  shared/config/       Variables de entorno validadas
  shared/http/         Formato de error { code, message } y validación de entrada
  shared/database/     Conexión con Drizzle y pg
  shared/events/       Bus de eventos interno con outbox (ADR-015)
test/                  Pruebas de integración (Supertest) y preparación de la base de pruebas
```

Los módulos de negocio (`src/modules/`) se crean cuando un paso los necesita. Los módulos no deben convertirse en microservicios: el estilo aprobado es un monolito modular.

## Repositorios

- Backend: [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B)
- Frontend: [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F)

## Trabajo

Las épicas se registran como issues con prefijo `[EPIC]`. Cada PR debe enlazar la épica y los requisitos relacionados. Consultar [CONTRIBUTING.md](CONTRIBUTING.md).

## Decisiones y alcance

- [Decisiones vigentes](docs/DECISIONS.md)
- [Arquitectura y límites de módulos](docs/ARCHITECTURE.md)
- [Contrato de API](docs/API_CONTRACT.md)
- [Épicas](docs/epics/README.md)
- [Plantilla ADR](docs/adr/0000-template.md)
- [Propuesta de modelo C4 (Structurizr DSL, pendiente de aprobación)](docs/c4/structurizr-proposal.dsl)

## Alcance excluido del MVP

Venta en línea, carrito, pagos, pedidos, domicilios, alertas de bajada de precio y extracción automatizada de catálogos de terceros. Las alertas son opcionales/futuras; SIPSA no se presenta como precio minorista de tienda.
