# Grill — issue #42: conexión con Drizzle y migraciones

- **Fuentes:**
  - Issue #42 (parte 2 de #12).
  - ADR-003 (PostgreSQL + PostGIS, un esquema por módulo).
  - ADR-021 (Drizzle, migraciones SQL versionadas, driver `pg` por confirmar).
  - ADR-012 (aclaración: la CI puede usar contenedores de servicio).
  - Reglas `arquitectura-monolito-modular.md` y `calidad-y-tdd.md`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Lo que ya estaba definido

- **Motor:** PostgreSQL 17 con PostGIS. En el equipo de desarrollo está la 17.4 con PostGIS 3.6.2, con las bases `valora_dev` y `valora_test` del usuario `valora`, verificadas el 11-nov-2026.
- **Drizzle:**
  - Cada módulo define sus tablas en `infrastructure/schema.ts`, dentro de su propio `pgSchema`.
  - Las migraciones se generan con `drizzle-kit`, se revisan y se versionan.
  - Una migración aplicada nunca se edita.
- **Límites:** solo `infrastructure/` y `shared/database` importan `drizzle-orm` o `pg`; `depcheck` lo verifica.
- **Scripts:** `db:generate`, `db:migrate` y `db:seed` (regla `forma-de-trabajo.md`).
- **CI:** contenedor de servicio de PostgreSQL + PostGIS. La imagen `postgis/postgis:17-3.6` existe y coincide con la versión local.
- **Pruebas de integración:** usan `valora_test`, limpian sus datos y nunca tocan `valora_dev`.

## Preguntas

### 1. Driver de PostgreSQL

- **Opciones:**
  - (a) `pg` (node-postgres).
  - (b) `postgres` (postgres.js).
- **Recomendación:** (a).
  - Es lo que propone ADR-021.
  - Es el más usado y probado, con pool de conexiones y transacciones claras, que el outbox de la #43 necesita.
  - La diferencia de velocidad no importa para el tamaño de Valora; EC-04 se medirá con pruebas de carga.
- **Decisión:** (a). Se agregan `pg` y `@types/pg` (desarrollo) con permiso al aprobar el plan.

### 2. Dónde viven las migraciones

- **Contradicción:** la regla `arquitectura-monolito-modular.md` decía que `infrastructure/` contiene las «migraciones del módulo», pero `drizzle-kit` genera una sola secuencia de migraciones para toda la base.
- **Opciones:**
  - (a) Una sola carpeta `drizzle/` en la raíz. Cada módulo define sus tablas en su `infrastructure/schema.ts` y su propio `pgSchema`; `drizzle-kit` las lee todas y genera la secuencia.
  - (b) Una carpeta por módulo, con una configuración de `drizzle-kit` por módulo y un orden de aplicación a mano.
- **Recomendación:** (a).
  - Es como funciona `drizzle-kit` (ADR-021); partirlo obliga a mantener varias configuraciones y un orden que se rompe fácil.
  - Los límites se mantienen: cada módulo sigue siendo dueño de sus tablas y su esquema; los `.sql` generados no se importan desde el código.
  - Una sola historia garantiza el orden entre tablas de distintos módulos.
- **Decisión:** (a). En este PR se corrige la regla local y se anota en `DECISIONS.md`.

### 3. Cuándo se aplican las migraciones

- **Opciones:**
  - (a) A mano (`pnpm db:migrate` en `valora_dev`), automáticamente antes de las pruebas de integración (en `valora_test`) y en la CI; nunca al arrancar la API.
  - (b) Al arrancar la API.
- **Recomendación:** (a).
  - Un cambio en la base no debe ocurrir solo por reiniciar el servidor; si la migración falla, la API ni siquiera arranca.
  - Con varias copias de la API (prueba de carga de EC-04), todas intentarían migrar a la vez.
  - Las pruebas siempre usan la base al día.
- **Decisión:** (a). Al definir el despliegue (ADR-012), «aplicar migraciones» será un paso del procedimiento, antes de arrancar la API.

### 4. Cómo se evita que las pruebas usen `valora_dev`

- **Opciones:**
  - (a) Con `NODE_ENV=test` la conexión usa `DATABASE_URL_TEST`, y se niega a conectarse si el nombre de la base no termina en `_test`.
  - (b) Lo mismo, sin la protección.
- **Recomendación:** (a).
  - Cumple el criterio de la issue sin depender de que nadie se equivoque al configurar su `.env`.
  - Cuesta una comprobación y su prueba, y evita perder datos de desarrollo.
- **Decisión:** (a). El mensaje de error nombra la base recibida, por ejemplo «Las pruebas solo pueden usar una base cuyo nombre termine en _test (recibida: valora_dev)».

### 5. Script `db:seed`

- **Conflicto:** la issue #42 y `forma-de-trabajo.md` piden `db:seed`, pero en este paso no hay tablas de negocio ni datos que sembrar. La siembra (RF-014, ADR-011) llega con `catalog` y `establishments` (H2-01, paso 4).
- **Opciones:**
  - (a) Dejar `db:seed` para el paso 4, quitarlo de la descripción de la #42 y agregarlo a la issue del paso 4.
  - (b) Crearlo ya, vacío.
- **Recomendación:** (a).
  - YAGNI: un script vacío no sirve a ningún paso y puede hacer creer que ya hay datos semilla.
  - El paso 4 lo diseña con los datos reales y sus pruebas.
- **Decisión:** (a). El script pasa a la issue #13 (paso 4). El cambio en las descripciones de las issues se muestra antes de aplicarlo en GitHub.

### 6. Qué hace la API si la base no responde al arrancar

- **Opciones:**
  - (a) No arranca: comprueba la conexión con `SELECT 1` y se detiene con un mensaje claro.
  - (b) Arranca igual, y el problema aparece como un 500 en la primera petición que use la base.
- **Recomendación:** (a).
  - El error aparece donde se entiende, no como un «error inesperado» que obliga a buscar en el log.
  - Es coherente con la validación de variables de entorno, que también falla al arrancar.
  - Un servidor que no puede funcionar no debería aceptar peticiones.
- **Decisión:** (a). El mensaje muestra el host, el puerto y el nombre de la base, nunca la contraseña.

## Resumen

| Tema | Decisión |
|---|---|
| Driver | `pg` (node-postgres) |
| Migraciones | Una sola carpeta `drizzle/` en la raíz; cada módulo define sus tablas en su `infrastructure/schema.ts` |
| Cuándo se migra | A mano (`pnpm db:migrate`), antes de las pruebas de integración y en la CI; nunca al arrancar |
| Base de las pruebas | Con `NODE_ENV=test` se usa `DATABASE_URL_TEST`, y solo si el nombre termina en `_test` |
| `db:seed` | Se crea en la issue #13 (paso 4) |
| Base no disponible al arrancar | La API no arranca; el mensaje no muestra la contraseña |
