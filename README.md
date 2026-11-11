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
- Pendiente: motor de persistencia (ADR-003 propuesto), estrategia CQRS/outbox y mecanismo de despliegue reproducible.
- Docker no forma parte del MVP aprobado.

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

- Node 22 LTS (ver `.nvmrc`) y pnpm (la versión exacta está en `packageManager` de `package.json`; se activa con `corepack`).
- PostgreSQL 16 con la extensión PostGIS, con las bases `valora_dev` y `valora_test`. Todavía no se usan: llegan con el paso 3 del H2-01 (Drizzle).

## Instalación

```bash
corepack enable   # o: corepack pnpm <comando>, si no tienes permisos de administrador
pnpm install
cp .env.example .env
```

## Crear las bases de datos

Con PostgreSQL en marcha, desde `psql` con un usuario con permisos de creación:

```sql
CREATE DATABASE valora_dev;
CREATE DATABASE valora_test;
c valora_dev
CREATE EXTENSION IF NOT EXISTS postgis;
c valora_test
CREATE EXTENSION IF NOT EXISTS postgis;
```

## Variables de entorno

Se validan al arrancar: si falta alguna o es inválida, la aplicación no inicia y el mensaje nombra la variable.

| Variable            | Descripción                                            |
| ------------------- | ------------------------------------------------------ |
| `PORT`              | Puerto HTTP (entero).                                  |
| `NODE_ENV`          | `development`, `test` o `production`.                  |
| `DATABASE_URL`      | Conexión a la base de desarrollo.                      |
| `DATABASE_URL_TEST` | Conexión a la base de pruebas.                         |
| `SESSION_SECRET`    | Secreto de la sesión; usa un valor propio y aleatorio. |

`.env` no se sube al repositorio; el ejemplo está en `.env.example`.

## Comandos

| Comando                             | Qué hace                                                         |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                          | Arranca la API en modo observación.                              |
| `pnpm build` / `pnpm start`         | Compila a `dist/` y arranca la versión compilada.                |
| `pnpm test` / `pnpm test:watch`     | Corre las pruebas (Jest).                                        |
| `pnpm test:cov`                     | Pruebas con cobertura en `coverage/`.                            |
| `pnpm typecheck`                    | Verifica tipos con TypeScript estricto.                          |
| `pnpm lint`                         | ESLint con reglas estrictas de TypeScript.                       |
| `pnpm format` / `pnpm format:check` | Prettier.                                                        |
| `pnpm depcheck`                     | Reglas de dependencia del monolito modular (dependency-cruiser). |

El CI repite `typecheck`, `lint`, `test:cov` y `depcheck` en cada pull request a `main`.

## Estructura

```text
docs/                  Decisiones, arquitectura, contrato OpenAPI y épicas
src/
  main.ts              Arranque
  app.module.ts        Módulo raíz
  app.setup.ts         Configuración común (prefijo /v1)
  health/              GET /v1/health
  shared/config/       Variables de entorno validadas
test/integration/      Pruebas de integración (Supertest)
```

Los módulos de negocio (`src/modules/`) y `src/domain/` se crean cuando un paso los necesita. Los módulos no deben convertirse en microservicios: el estilo aprobado es un monolito modular.

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
