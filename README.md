# Valora — Backend

API y lógica de negocio de **Valora**, plataforma colaborativa para comparar precios entre tiendas de barrio, minimercados y supermercados de Armenia y el Quindío.

**En producción: <https://www.valoora.app>** · estado de la API: <https://www.valoora.app/v1/health>

> Este repositorio contiene el backend. El frontend vive en [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F).

## Estado

Actualizado el 27 de noviembre de 2026. La API está **desplegada y en uso**; en `main` está la versión con etiqueta `v0.11.0`.

| Pieza             | Dónde                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Dirección pública | <https://www.valoora.app> (`valoora.app` redirige a `www`). Vercel sirve la PWA y reenvía `/v1/*` a la API  |
| API               | Render, con la imagen del `Dockerfile` (`render.yaml`): <https://valora-api-faau.onrender.com/v1/health>    |
| Base de datos     | Neon, PostgreSQL + PostGIS (`infra/neon/`, Terraform)                                                       |
| Fotos             | Supabase Storage (ADR-022)                                                                                  |
| Correo            | Resend, con el dominio `valoora.app` verificado (ADR-029)                                                   |
| Inicio de sesión  | Correo y contraseña, o Google (activo en producción)                                                        |
| Despliegue        | Merge de `dev` a `main`, con aprobación del entorno `produccion` ([docs/despliegue.md](docs/despliegue.md)) |

En `dev` y todavía sin publicar: `/v1/health` informa el `commit` que sirve, y el flujo de despliegue espera esa versión y corre una prueba de humo de solo lectura.

### Qué hace hoy

| Área (módulo)                                    | Qué hay                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuentas (`identity`)                             | Registro, sesión de servidor con CSRF, roles y límites; verificación de correo y bienvenida; inicio con Google; contraseña olvidada; cambio de nombre; eliminación de la cuenta con 10 días de gracia |
| Catálogo y tiendas (`catalog`, `establishments`) | Categorías, búsqueda por texto, alias o código de barras, fotos, tiendas con PostGIS por cercanía y municipio, y propuestas de productos y tiendas                                                    |
| Precios y comparación (`pricing`, `comparison`)  | Registro idempotente (apto para la cola sin conexión), comparación con orden neutral, vigencia, historial de 30 días, productos destacados y referencia mayorista SIPSA                               |
| Confiabilidad (`reliability`)                    | Puntaje, precios anómalos y plausibilidad, reputación, moderación con bitácora inmutable, apelación y suspensión                                                                                      |
| Comercios (`commerce`)                           | Verificación de la tienda, precios oficiales (uno a uno o por archivo), promociones aparte del orden, disputas, revocación y salida del comercio                                                      |
| Avisos (`notifications`)                         | Contadores de pendientes para moderación y comercio, y Web Push (probado en iPhone con la PWA instalada y en Android)                                                                                 |

El contrato está en [`docs/openapi.yaml`](docs/openapi.yaml) y las decisiones, en [`docs/DECISIONS.md`](docs/DECISIONS.md).

### Pendiente y límites conocidos

- **Carga (EC-04, #35):** no se cumple en el plan gratuito. Con 500 usuarios, p95 de 12,6 s y 71 % de errores ([evidencia del 17-nov](docs/evidencia/EC-04.md)). No repetir la prueba larga contra producción.
- **Datos (#118):** la semilla tiene 150 productos (175 presentaciones); falta verificar en tienda buena parte de ellos y de sus códigos de barras.
- **Avisos (EC-09):** la latencia p95 no está medida ([evidencia](docs/decisiones/avisos/evidencia-push.md)).
- **Despliegue (#23):** hay tres despliegues correctos registrados; falta medir el tiempo completo hasta que el código nuevo queda activo, que llega con la próxima versión.
- **ADR «Propuestos»:** 023 a 028 y 036 a 042 esperan aceptación del equipo, aunque la mayoría ya está construida.
- **Precios en línea:** apagados. La integración con Olímpica se cerró por sus términos de uso (ADR-041).
- **Plan gratuito de Render:** el servicio se duerme. `keepalive-api.yml` lo mantiene despierto entre las 07:00 y las 23:00 de Colombia; fuera de ese horario, la primera petición tarda cerca de un minuto.

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

En PowerShell: `Copy-Item .env.example .env`. Luego, en `.env`, cambia `SESSION_SECRET` y `REPORTER_KEY_SECRET` por textos largos y aleatorios, **propios de tu equipo** (no copies los de otra persona). Puedes generarlos con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Los demás valores ya sirven si creas la base como en el paso 5. `.env` **nunca** se sube al repositorio. Si alguien te pasa su `.env`, cambia esas dos líneas.

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

### Crear un moderador

El primer moderador lo crea quien administra el servidor (grill de la #73, pregunta 4). Registra la cuenta con `POST /v1/auth/register` y luego:

```bash
pnpm identity:set-role tu-correo@ejemplo.com moderador "Primer moderador del equipo"
```

El cambio queda en la bitácora `identity.role_changes` como hecho por el sistema.

**Moderador de prueba para entornos de prueba (`pnpm db:seed-moderador`).** Crea la cuenta y le da el rol, sin dejar ningún dato en el código: el correo y la contraseña (de 10 a 128 caracteres) se leen de `SEED_MODERATOR_EMAIL` y `SEED_MODERATOR_PASSWORD`, en tu `.env` o en la línea de comandos. Se puede repetir: si la cuenta ya existe, no cambia su contraseña y solo se asegura de que sea moderador. No lo uses en producción real. Después, un moderador puede subir o bajar a otros con `POST /v1/moderation/roles`. Con esa cuenta, `GET /v1/moderation/queue` muestra los reportes pendientes.

### Fotos de productos

Las fotos que sube un moderador (`PUT /v1/moderation/products/{productId}/image`, ADR-020) se guardan en la carpeta `MEDIA_DIR` (por defecto `media/`, fuera de Git) y la API las sirve en `MEDIA_PUBLIC_URL`. Agrega las dos variables a tu `.env` (están en `.env.example`). En producción van a Supabase Storage (ADR-022, `SUPABASE_URL` y `SUPABASE_SECRET_KEY`), porque Render borra el disco en cada despliegue; sin esas variables se usa la carpeta local.

### Llenar el historial de precios

El historial (`GET /v1/products/{productId}/history`, #83) se llena con los eventos de precios. Los precios reportados antes de que existiera se cargan una vez con:

```bash
pnpm comparison:rebuild-history
```

Se puede repetir sin duplicar nada.

### Prueba de humo

Recorre por HTTP el camino completo contra una API encendida y con la semilla cargada: búsqueda, tiendas cercanas, comparación (por ubicación y por municipio), referencia SIPSA, registro de precio con reintento y duplicado, llegada del precio a la comparación por el outbox, mis aportes, marca de dudoso y, si hay moderador, el descarte y la apelación. Responde «¿está todo conectado?», cosa que `pnpm test` no cubre porque cada prueba vacía sus tablas.

```bash
pnpm dev                                   # en otra terminal
pnpm smoke                                 # recorrido completo
pnpm smoke -- --solo-lectura               # solo consultas públicas
```

- `SMOKE_URL` cambia la dirección (por defecto `http://localhost:3000`).
- `SMOKE_MODERATOR_EMAIL` y `SMOKE_MODERATOR_PASSWORD` (de una cuenta moderadora, ver «Crear un moderador») activan los pasos de moderación.
- **El recorrido completo crea datos:** dos cuentas `humo-…@valora.test` y un precio de prueba que termina descartado. Úsalo en `valora_dev`; contra el sistema desplegado, solo `--solo-lectura`.
- Termina con código 1 si un paso falla.

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

| Variable                  | Descripción                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | Puerto HTTP (entero).                                                                                                                                    |
| `NODE_ENV`                | `development`, `test` o `production`.                                                                                                                    |
| `DATABASE_URL`            | Conexión a la base de desarrollo.                                                                                                                        |
| `DATABASE_URL_TEST`       | Conexión a la base de pruebas; su nombre debe terminar en `_test`.                                                                                       |
| `SESSION_SECRET`          | Firma el token CSRF (ADR-014); valor propio y aleatorio. Cambiarlo cierra las sesiones abiertas.                                                         |
| `REPORTER_KEY_SECRET`     | Firma la clave seudónima del reportante (#31); valor propio y aleatorio. **No cambiarlo una vez en uso:** las reputaciones quedan asociadas a esa clave. |
| `OUTBOX_POLL_INTERVAL_MS` | Cada cuántos milisegundos el repartidor revisa la bandeja de eventos (inicial: 5000).                                                                    |
| `OUTBOX_MAX_ATTEMPTS`     | Intentos de entrega antes de marcar un evento como fallido (inicial: 5).                                                                                 |
| `MEDIA_DIR`               | Carpeta donde se guardan las fotos subidas (ADR-020); por defecto `media`, fuera de Git.                                                                 |
| `MEDIA_PUBLIC_URL`        | Dirección pública de esa carpeta; en local, `http://localhost:3000/media`.                                                                               |

Si alguien agrega una variable, aparece en `.env.example`: cópiala a tu `.env`. `.env.example` es la referencia: este README no copia sus valores para que no se desactualice.

### Secretos y variables en GitHub

Se configuran en **Settings → Secrets and variables → Actions** (solo quien administra el repositorio). Ningún valor real va en el repositorio ni en esta documentación.

| Nombre                                                   | Tipo      | Para qué sirve hoy                                                                                                                                                                                           |
| -------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SONAR_TOKEN`                                            | Secreto   | Análisis de SonarQube en la CI (#24). Si deja de funcionar, se regenera en SonarQube Cloud (Analysis Method → With GitHub Actions) y se actualiza aquí.                                                      |
| `SESSION_SECRET`, `REPORTER_KEY_SECRET`                  | Secretos  | Reservados para el despliegue (#23). La CI no los usa: las pruebas traen sus propios valores (`test/setup-env.ts`). Las mismas reglas de la tabla anterior: no cambiar `REPORTER_KEY_SECRET` una vez en uso. |
| `PORT`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_MAX_ATTEMPTS` | Variables | Reservadas para el despliegue (#23); no son secretas.                                                                                                                                                        |

La base de pruebas de la CI usa una contraseña distinta en cada corrida, generada en el workflow (#24).

## Despliegue a producción

Un merge de `dev` a `main` lanza el flujo `Despliegue` (ADR-012, #23). Lo único manual es **aprobar el entorno `produccion`** en GitHub: el flujo aplica las migraciones en Neon, dispara Render, espera a que Render sirva el commit de esa ejecución (`GET /v1/health` informa su `commit`) y corre una prueba de humo de solo lectura sobre la dirección de Render y la pública. Con «Run workflow» y `cargar_semilla` también carga la semilla. El procedimiento, las variables, la reversa y la evidencia de los despliegues están en [`docs/despliegue.md`](docs/despliegue.md).

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
| `pnpm seed:imagenes`                | Llena en `seed/productos.csv` el enlace de la foto de Open Food Facts por código de barras.   |
| `pnpm smoke`                        | Prueba de humo contra una API encendida (ver «Prueba de humo»).                               |

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
  domain/              Reglas puras: precio por unidad, vigencia, código de barras, precio vigente, orden neutral, sesión, confiabilidad y anómalos
  shared/config/       Variables de entorno validadas
  shared/http/         Formato de error { code, message } y validación de entrada
  shared/database/     Conexión con Drizzle y pg
  shared/events/       Bus de eventos interno con outbox (ADR-015)
  modules/identity/    Cuentas, sesión de servidor, CSRF, roles y límites de frecuencia
  modules/catalog/     Productos, presentaciones y categorías
  modules/establishments/  Tiendas con ubicación y búsqueda por cercanía
  modules/imports/     Semilla: lee seed/ y guarda por catalog y establishments
  modules/pricing/     Reportes de precio (solo inserción) e idempotencia
  modules/reliability/ Observaciones, reputación, veredicto de anómalos (PriceReported → PriceAssessed) y moderación
  modules/comparison/  Precio vigente (price_current), actualizado por PriceAssessed y PriceWithdrawn, y la consulta de comparación
  modules/commerce/    Comercios: verificación de la tienda, precios oficiales y promociones
  modules/notifications/ Avisos Web Push a moderación y comercio, alimentados por el outbox
  moderation/          Resumen de pendientes del panel (une las colas de varios módulos)
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
- Módulo comercial: comercios verificados, precios oficiales y promociones.
- Avisos a moderación y comercio.

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

## Licencia

Uso académico y no comercial; no se permite reproducirlo ni redistribuirlo sin autorización de los titulares (el equipo del proyecto y JuanJo0775). El texto completo está en [LICENSE](LICENSE). No es una licencia de código abierto.
