# Valora — Backend

API y lógica de negocio de **Valora**, plataforma colaborativa para comparar precios entre tiendas de barrio, minimercados y supermercados de Armenia y el Quindío.

> Este repositorio contiene el backend. El frontend vive en [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F).

## Estado

Hito **H2-01** (esqueleto del núcleo), paso 7 en curso.

| Listo en `dev`                   | Qué hay                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Configuración y calidad (#10)    | NestJS, TypeScript estricto, ESLint, Prettier, Jest, reglas de dependencia y CI                                               |
| Reglas del dominio (#11, #18)    | Precio por unidad base (RF-004) y vigencia por TTL (RF-010)                                                                   |
| Infraestructura compartida (#12) | Formato de error `{ code, message }`, PostgreSQL + PostGIS con Drizzle y migraciones, bus de eventos con outbox               |
| Catálogo (#49, #52)              | Módulo `catalog` con categorías, `GET /v1/products/{productId}` y búsqueda por texto o código de barras en `GET /v1/products` |
| Establecimientos (#50)           | Módulo `establishments` con ubicación PostGIS y `GET /v1/establishments/nearby`                                               |
| Semilla (#51)                    | `pnpm db:seed`: tiendas de OpenStreetMap y productos verificados por el equipo, desde `seed/`                                 |
| Registro de precios (#14)        | Módulos `pricing` y `comparison`: `POST /v1/reports` con `Idempotency-Key` y precio vigente en `price_current` por el outbox  |
| Orden neutral (#21)              | Regla `rankOffers` del dominio: orden por precio por unidad, distancia o fecha, con desempate determinista (EC-06)            |
| Comparación (#15)                | `GET /v1/products/{productId}/comparison`: precios vigentes en las tiendas del radio, en orden neutral y sin caché (EC-08)    |
| Sesión (#16, #62)                | Módulo `identity`: registro, sesión con cookie, CSRF, roles y límites; `POST /v1/reports` exige sesión de reportante          |
| Score de confiabilidad (#19)     | Regla del dominio: corroboración, reputación del reportante y decaimiento por edad, con niveles alta, media y baja (RF-011)   |

Siguiente: prueba de extremo a extremo (paso 9, #17). Docker **no** se usa en el desarrollo local; solo la CI levanta un contenedor de PostgreSQL + PostGIS para las pruebas.

## Primeros pasos (desde cero)

Sigue los pasos en orden. Al final, `pnpm test` debe pasar completo y `GET /v1/health` debe responder.

### 1. Instala las herramientas

| Herramienta | Versión                              | Dónde conseguirla                                                                          |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Git         | cualquiera reciente                  | <https://git-scm.com/downloads>                                                            |
| Node.js     | 22 LTS (ver `.nvmrc`)                | <https://nodejs.org/en/download>                                                           |
| pnpm        | 10.18.3 (fijada en `packageManager`) | Viene con Node por `corepack`; **no** la instales aparte                                   |
| PostgreSQL  | 17                                   | <https://www.postgresql.org/download/>                                                     |
| PostGIS     | 3.x para PostgreSQL 17               | Stack Builder → _Spatial Extensions_, o el instalador directo (ver «Problemas frecuentes») |

Comprueba:

```bash
git --version
node -v          # debe empezar por v22
corepack --version
```

Deja al menos **5 GB libres** en el disco: la instalación, las pruebas y las migraciones fallan con `ENOSPC` si el disco se llena.

### 2. Clona el repositorio

Se trabaja siempre a partir de la rama `dev`:

```bash
git clone https://github.com/JuanJo0775/Sistema_valora_B.git
cd Sistema_valora_B
git switch dev
```

### 3. Instala las dependencias

```bash
corepack enable
pnpm install
```

En Windows, si `corepack enable` falla con `EPERM`, usa esto (no necesita administrador) y antepón `corepack` a cada comando de esta guía (`corepack pnpm test`, `corepack pnpm dev`…):

```bash
corepack prepare pnpm@10.18.3 --activate
corepack pnpm install
```

### 4. Crea tu archivo `.env`

```bash
cp .env.example .env
```

En PowerShell: `Copy-Item .env.example .env`. Luego, en `.env`, cambia `SESSION_SECRET` por un texto largo y aleatorio. Los demás valores ya sirven si creas la base como en el paso 5. `.env` **nunca** se sube al repositorio.

### 5. Crea el usuario y las bases de datos

1. Enciende PostgreSQL. En Windows: **Servicios** → `postgresql-x64-17` → **Iniciar**, y ponlo en inicio **Automático**.
2. Abre **SQL Shell (psql)** desde el menú de inicio (el instalador no agrega `psql` al PATH). Pulsa Enter en los cuatro primeros datos y escribe la contraseña del usuario `postgres`.
3. Pega:

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

La última línea debe mostrar `POSTGIS="3.x…"`. Sal con `\q`.

- El usuario `valora` con contraseña `valora` es el de `.env.example` y es **solo para tu equipo local**.
- `CREATE EXTENSION` se ejecuta como `postgres`, porque `valora` no es superusuario.

### 6. Aplica las migraciones

```bash
pnpm db:migrate
```

Crea en `valora_dev` los esquemas y tablas (`shared`, `catalog`, `establishments`…) y carga las categorías del catálogo. **No necesitas migrar `valora_test`:** las pruebas lo hacen solas.

### 7. Carga los datos iniciales

```bash
pnpm db:seed
```

Carga en `valora_dev` las tiendas y los productos **verificados** de `seed/`. Se puede correr las veces que se quiera: no duplica ni borra. Cómo verificar filas y qué hace cada columna: [seed/README.md](seed/README.md).

### 8. Comprueba que todo funciona

```bash
pnpm test        # todas las pruebas deben pasar (PostgreSQL debe estar encendido)
pnpm dev         # arranca la API en http://localhost:3000
```

Con la API en marcha:

- <http://localhost:3000/v1/health> debe responder `{"status":"ok"}`.
- <http://localhost:3000/v1/establishments/nearby?lat=4.5339&lng=-75.6811> lista las tiendas sembradas cerca del centro de Armenia.
- Los productos aparecen en `GET /v1/products?q=…` cuando el equipo los verifique en `seed/productos.csv` y se vuelva a correr `pnpm db:seed`.

Si la API no arranca, el mensaje dice qué falta: una variable de entorno o la conexión a la base (base, host y puerto).

## Día a día

### Al empezar una tarea

```bash
git switch dev
git pull
pnpm install       # por si alguien agregó dependencias
pnpm db:migrate    # por si alguien agregó migraciones
pnpm db:seed       # por si alguien verificó datos nuevos
git switch -c feat/<tema>
```

El flujo completo (ramas, commits, TDD, pull requests y cómo mezclar) está en [CONTRIBUTING.md](CONTRIBUTING.md).

### Migraciones (Drizzle)

- Cada módulo define sus tablas en `src/modules/<módulo>/infrastructure/schema.ts`, dentro de su propio esquema de PostgreSQL.
- Todas las migraciones viven en **una sola carpeta**, `drizzle/`, con una secuencia numerada para toda la base.

Para cambiar la base:

1. Edita el `schema.ts` del módulo.
2. Genera la migración con un nombre que diga qué hace:

   ```bash
   pnpm db:generate --name <que-hace>
   ```

   Para datos de referencia o SQL propio (como las categorías), usa `pnpm exec drizzle-kit generate --custom --name <que-hace>` y escribe el SQL en el archivo vacío que crea.

3. **Revisa el `.sql` generado** antes de hacer commit.
4. Aplícala en tu base: `pnpm db:migrate`.
5. Haz commit del `.sql` **y** de los archivos de `drizzle/meta/`.

Reglas:

- **Nunca edites una migración que ya está en `dev`.** Para corregir algo, crea una migración nueva.
- La API **no** migra sola al arrancar: siempre es `pnpm db:migrate`.
- Las pruebas migran `valora_test` antes de correr y se niegan a usar una base cuyo nombre no termine en `_test`.

## Variables de entorno

Se validan al arrancar: si falta alguna o es inválida, la aplicación no inicia y el mensaje nombra la variable.

| Variable                  | Descripción                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                    | Puerto HTTP (entero).                                                                 |
| `NODE_ENV`                | `development`, `test` o `production`.                                                 |
| `DATABASE_URL`            | Conexión a la base de desarrollo.                                                     |
| `DATABASE_URL_TEST`       | Conexión a la base de pruebas; su nombre debe terminar en `_test`.                    |
| `SESSION_SECRET`          | Secreto de la sesión; usa un valor propio y aleatorio.                                |
| `OUTBOX_POLL_INTERVAL_MS` | Cada cuántos milisegundos el repartidor revisa la bandeja de eventos (inicial: 5000). |
| `OUTBOX_MAX_ATTEMPTS`     | Intentos de entrega antes de marcar un evento como fallido (inicial: 5).              |

Si alguien agrega una variable, aparece en `.env.example`: cópiala a tu `.env`.

## Comandos

| Comando                             | Qué hace                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Arranca la API en modo observación.                                                           |
| `pnpm build` / `pnpm start`         | Compila a `dist/` y arranca la versión compilada.                                             |
| `pnpm test` / `pnpm test:watch`     | Corre las pruebas (Jest). Necesita PostgreSQL encendido.                                      |
| `pnpm test:cov`                     | Pruebas con cobertura en `coverage/`.                                                         |
| `pnpm typecheck`                    | Verifica tipos con TypeScript estricto.                                                       |
| `pnpm lint`                         | ESLint con reglas estrictas de TypeScript.                                                    |
| `pnpm format` / `pnpm format:check` | Prettier.                                                                                     |
| `pnpm depcheck`                     | Reglas de dependencia del monolito modular (dependency-cruiser).                              |
| `pnpm db:generate`                  | Genera una migración en `drizzle/` a partir de los `schema.ts`.                               |
| `pnpm db:migrate`                   | Aplica las migraciones pendientes en la base de `DATABASE_URL` (lee `.env`).                  |
| `pnpm db:seed`                      | Carga las filas verificadas de `seed/` en la base de `DATABASE_URL` (sin duplicar ni borrar). |

Antes de abrir un pull request, corre `pnpm typecheck`, `pnpm lint`, `pnpm test:cov` y `pnpm depcheck`. La CI corre en cada pull request hacia `dev` o `main`, con dos jobs obligatorios: `Calidad` (`typecheck`, `lint`, `format:check`, `depcheck` y `build`) y `Pruebas` (`test:cov --ci`). Si una sola verificación falla, no se mezcla.

## Problemas frecuentes

| Síntoma                                                                  | Causa y solución                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` o `pnpm dev` dicen «No se pudo conectar a la base de datos…» | PostgreSQL está apagado. Inícialo en **Servicios** (`postgresql-x64-17`).                                                                                                               |
| `CREATE EXTENSION postgis` dice que no existe                            | PostGIS no quedó instalado para PostgreSQL 17. Reinstálalo (fila siguiente).                                                                                                            |
| Stack Builder se cuelga («no responde») al descargar PostGIS             | Ciérralo y usa el instalador directo: <https://download.osgeo.org/postgis/windows/pg17/> (`postgis-bundle-pg17x64-setup-3.x.x-1.exe`). Al instalar, desmarca «Create spatial database». |
| En `psql` aparece «"more" no se reconoce como un comando»                | Ejecuta `\pset pager off` y repite la consulta.                                                                                                                                         |
| `corepack enable` falla con `EPERM`                                      | Usa la alternativa del paso 3.                                                                                                                                                          |
| Algo falla con `ENOSPC`, «out of memory» o «failed to cache»             | El disco o la memoria se llenaron. Libera espacio (y vacía la Papelera), cierra programas y reinicia. Si la RAM es poca, corre `pnpm test -- --runInBand`.                              |
| Las pruebas fallan al migrar con «could not create unique index»         | Una prueba que falló dejó filas en `valora_test`. Vacía las tablas del módulo, por ejemplo `TRUNCATE catalog.presentations, catalog.products;` en `valora_test`, y repite.              |
| La API no arranca y nombra una variable                                  | Falta en tu `.env`. Cópiala de `.env.example`.                                                                                                                                          |
| Los checks de un pull request se quedan «en cola»                        | Cierra y reabre el pull request (ver [CONTRIBUTING.md](CONTRIBUTING.md)).                                                                                                               |

## Estructura

```text
docs/                  Decisiones (adr/, decisiones/), arquitectura, contrato OpenAPI y épicas
drizzle/               Migraciones SQL de toda la base (una sola secuencia)
seed/                  Datos iniciales (CSV) que carga pnpm db:seed
src/
  main.ts              Arranque
  app.module.ts        Módulo raíz
  app.setup.ts         Configuración común (prefijo /v1, validación y filtro de errores)
  health/              GET /v1/health
  domain/              Reglas puras: precio por unidad, vigencia, código de barras, precio vigente, orden neutral, sesión y confiabilidad
  shared/config/       Variables de entorno validadas
  shared/http/         Formato de error { code, message } y validación de entrada
  shared/database/     Conexión con Drizzle y pg
  shared/events/       Bus de eventos interno con outbox (ADR-015)
  modules/identity/    Cuentas, sesión de servidor, CSRF, roles y límites de frecuencia
  modules/catalog/     Productos, presentaciones y categorías
  modules/establishments/  Tiendas con ubicación y búsqueda por cercanía
  modules/imports/     Semilla: lee seed/ y guarda por catalog y establishments
  modules/pricing/     Reportes de precio (solo inserción) e idempotencia
  modules/comparison/  Precio vigente (price_current), actualizado por PriceReported, y la consulta de comparación
  seed.ts              Entrada de pnpm db:seed
test/                  Pruebas de integración (Supertest) y preparación de la base de pruebas
```

Cada módulo de `src/modules/` expone solo su `index.ts`. Los demás módulos se crean cuando un paso los necesita. El estilo aprobado es un monolito modular: los módulos no se convierten en microservicios.

## Responsabilidades del backend

- Identidad, autenticación, sesiones y autorización RBAC.
- Catálogo de productos y presentaciones.
- Directorio y geolocalización de establecimientos.
- Registro e historial de reportes de precios.
- Reglas de confiabilidad, detección de anomalías y moderación.
- Consulta y comparación de precios.
- Carga semilla manual y referencias SIPSA.
- Módulo comercial del Corte 3, según el alcance aprobado.

## Decisiones y alcance

- [Decisiones vigentes](docs/DECISIONS.md) (incluye las versiones fijadas)
- [Decisiones por issue](docs/decisiones/) (grill, contrato y plan de cada tarea)
- [Arquitectura y límites de módulos](docs/ARCHITECTURE.md)
- [Contrato de API (OpenAPI)](docs/openapi.yaml) y [guía del contrato](docs/API_CONTRACT.md)
- [Diagramas](docs/diagramas/README.md)
- [Épicas](docs/epics/README.md)
- [Plantilla ADR](docs/adr/0000-template.md)

**Fuera del MVP:** venta en línea, carrito, pagos, pedidos, domicilios, alertas de bajada de precio y extracción automatizada de catálogos de terceros. SIPSA no se presenta como precio minorista de tienda.

## Repositorios

- Backend: [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B)
- Frontend: [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F)
