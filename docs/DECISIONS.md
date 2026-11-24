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
| ADR-004 | CQRS ligero con precio vigente precalculado (aceptado el 12 de noviembre de 2026) | Reportes de solo inserción en `pricing`; modelo de lectura `comparison.price_current`, actualizado por el evento `PriceReported` a través del outbox (segundos de retraso). Gana el reporte con el mayor `observedAt`. Score y anómalos son diferidos. |
| ADR-005 | Vigencia y confiabilidad: TTL por categoría y score ponderado (aceptado el 11 de noviembre de 2026) | Estados vigente, por confirmar (1 a 2 TTL) y desactualizado (más de 2 TTL); score con una función pura. Se acepta el modelo: los valores (7 y 14 días, pesos del score) siguen provisionales y parametrizables hasta calibrarlos. |
| ADR-006 | Detección de reportes anómalos: reglas estadísticas y revisión humana (aceptado el 14 de noviembre de 2026) | Reglas puras y parametrizables en `src/domain/anomaly.ts`; el reporte sospechoso queda en revisión humana y no cuenta como vigente. |
| ADR-008 | Resolución entre precio oficial y precio reportado (aceptado el 21 de noviembre de 2026) | El precio oficial se muestra con su fuente y el reportado lo contrasta; la regla vive en `src/domain`. |
| ADR-009 | Neutralidad: promociones separadas del orden de la comparación (aceptado el 12 de noviembre de 2026) | El orden solo usa precio, precio por unidad base, distancia y frescura; las promociones se muestran aparte. |
| ADR-013 | Privacidad por diseño: identidad del reportante separada y no pública (aceptado el 15 de noviembre de 2026) | La API pública nunca devuelve la identidad del reportante; la identidad vive en `identity` y el resto de módulos solo ve una clave opaca. |
| ADR-016 | Participación de comercios pequeños sin punto de venta (aceptado el 21 de noviembre de 2026) | El portal de comercios actualiza precios con una pantalla rápida y carga por plantilla; un precio no reconfirmado pasa a «por confirmar». |
| ADR-014 | Sesiones administradas por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No sustituir por JWT bearer sin una nueva decisión aprobada. |
| ADR-015 | Eventos de dominio internos con outbox (aceptado el 11 de noviembre de 2026) | El evento se guarda en la tabla outbox del esquema `shared` en la misma transacción que el cambio; un repartidor del mismo proceso lo entrega al menos una vez y los receptores ignoran repetidos. `PrecioOficialPublicado` se procesa en la misma transacción (EC-02). Sin broker externo. |
| ADR-018 | Backend: NestJS sobre Express (aceptado el 8 de noviembre de 2026) | Las reglas de `domain` se escriben en TypeScript puro; su validación práctica es el esqueleto H2-01. |
| ADR-017 | Frontend PWA: React + Vite con vite-plugin-pwa (aceptado el 8 de noviembre de 2026) | El cliente es una PWA en un repositorio aparte que consume el contrato `/v1`; la instalación y el modo sin conexión salen de `vite-plugin-pwa`. |
| ADR-019 | Mapa de establecimientos: OpenStreetMap con Leaflet (aceptado el 16 de noviembre de 2026) | El mapa de la PWA usa teselas de OpenStreetMap con su atribución visible; los tipos (`barrio`, `minimercado`, `supermercado`, `descuento`) y el radio de 0,5 a 3 km salen de este ADR. Un solo tema bajo este número. |
| ADR-020 | Imágenes de productos (aceptado el 15 de noviembre de 2026) | Una imagen por producto: Open Food Facts, foto del equipo o ilustración genérica. En el Corte 2 solo el moderador sube fotos (JPEG, PNG o WebP hasta 2 MB; WebP de 800 px como máximo, sin metadatos). Almacenamiento detrás de `ImageStorage`: `SupabaseImageStorage` se implementó mediante PR #126 y se activa con `SUPABASE_URL`; `LocalImageStorage` queda para desarrollo. La decisión ADR-022 sigue Propuesta hasta aceptación explícita y prueba de una foto real tras redespliegue. Ver [docs/adr/0020-imagenes-productos.md](adr/0020-imagenes-productos.md). |
| ADR-021 | Acceso a datos: Drizzle ORM con migraciones SQL versionadas (aceptado el 11 de noviembre de 2026) | Tablas en `infrastructure/schema.ts` con un `pgSchema` por módulo; migraciones generadas con `drizzle-kit`, revisadas y versionadas; driver `pg`; solo `infrastructure/` y `shared/database` importan Drizzle. Ver [docs/adr/0021-acceso-datos-drizzle.md](adr/0021-acceso-datos-drizzle.md). |
| ADR-022 | Fotos subidas en Supabase Storage (aceptado el 17 de noviembre de 2026) | Las fotos que sube el moderador van a un bucket público de Supabase Storage (`productos`, solo WebP, hasta 2 MB) detrás del puerto `ImageStorage`, porque el disco de Render se borra en cada despliegue. Se activa con `SUPABASE_URL`; sin ella, carpeta local para desarrollo. El plan gratuito pausa el proyecto tras 7 días sin actividad; `keepalive.yml` lo evita (supuesto). Ver [docs/adr/0022-fotos-supabase-storage.md](adr/0022-fotos-supabase-storage.md) y `docs/despliegue.md`. |
| ADR-029 | Verificación de correo e inicio con Google en el módulo `identity` propio (aceptado el 17 de noviembre de 2026) | Se mantiene `identity` (ADR-014) y se añade la verificación de correo con un token de un solo uso (solo se guarda su hash, vale 24 horas) y un puerto `EmailSender` (`ConsoleEmailSender` o Resend, según `EMAIL_PROVIDER`); registrar precios exige correo verificado (403 `EMAIL_NOT_VERIFIED`). El reenvío es por la cuenta de la sesión, no por correo (3 por hora). Fase 1 implementada en el backend; después, inicio con Google por OpenID Connect propio, vinculado a la misma cuenta. Se descartan Supabase Auth y Clerk porque sustituyen `identity` y sacan los datos de Neon. Falta elegir proveedor de correo y un remitente verificable. Ver [docs/adr/0029-verificacion-de-correo-e-inicio-con-google.md](adr/0029-verificacion-de-correo-e-inicio-con-google.md). |
| ADR-030 | Plausibilidad de precios: referencia con arranque en frío y piso absoluto (aceptado, 17 de noviembre de 2026) | Un precio menor que $100 o mayor que $5.000.000 se rechaza con 422 `IMPLAUSIBLE_PRICE`. Si no hay 3 cuentas de referencia, el precio se compara con la mediana de al menos 3 tiendas del municipio (datos iniciales incluidos) y, si no hay, con el mayorista SIPSA; menos del 40 % o más del 250 % de la mediana (50 % del mayorista) queda `en_revision` por el camino existente, sin ser titular. Marcar un reporte vigente también lo saca del titular hasta la decisión del moderador. Parámetros provisionales en `PLAUSIBILITY_PARAMS`. Nace del caso de $12 por 1 kg de arroz. Ver [docs/adr/0030-plausibilidad-de-precios.md](adr/0030-plausibilidad-de-precios.md). |
| ADR-031 | Ahorro de ancho de banda: compresión, caché pública corta y guardas de la prueba de carga (aceptado, 18 de noviembre de 2026) | Render suspendió la API por pasar de 5 GB de salida (11 GB). La API comprime con gzip o brotli (más de 1 kB); las lecturas públicas sin ubicación llevan `s-maxage` (60 s como máximo si traen precios) para que Vercel las guarde; lo que lleva ubicación, sesión, reportes, moderación y todos los errores es `no-store`. `load.yml` ya no apunta a producción por defecto, exige `CARGA-EN-PRODUCCION` para onrender.com o vercel.app y baja a 50 usuarios y 2 minutos. Ver [docs/adr/0031-ahorro-de-ancho-de-banda.md](adr/0031-ahorro-de-ancho-de-banda.md). |
| ADR-032 | Eliminación de la propia cuenta: borrado definitivo con 10 días de gracia (aceptado, 18 de noviembre de 2026) | `POST /v1/me/account-deletion` (sesión, CSRF y contraseña) marca la cuenta pendiente, revoca sus sesiones y responde 202 con `scheduledFor` (+10 días); en la gracia el login responde 403 `ACCOUNT_PENDING_DELETION` y `POST /v1/auth/restore-account` la restaura. Una purga interna (al arrancar y cada hora, nunca adelantada) borra la cuenta, sus sesiones y enlaces de verificación en una transacción por cuenta. Se conservan, sin datos personales, los reportes, la reputación, las propuestas y las marcas: la única unión entre persona y clave seudónima era la fila de la cuenta. El último moderador no puede eliminarse (403 `LAST_MODERATOR_CANNOT_DELETE`). Alternativas: borrado inmediato, anonimización y gracia de 30 días. Ver [docs/adr/0032-eliminacion-de-cuenta.md](adr/0032-eliminacion-de-cuenta.md) y `docs/privacidad.md`. |
| ADR-033 | Contraseña olvidada, contraseña para cuentas de Google y reautenticación reciente (aceptado, 22 de noviembre de 2026) | `POST /v1/auth/forgot-password` responde siempre 202 sin cuerpo (sin enumeración) y envía por correo un enlace `/restablecer-contrasena?token=` de 1 hora y un solo uso (solo se guarda el hash, tabla `identity.password_resets`; 5 por IP en 15 minutos y 3 por correo por hora). `POST /v1/auth/reset-password` guarda la contraseña con las reglas del registro, revoca todas las sesiones, verifica el correo y no abre sesión (422 `INVALID_TOKEN` genérico). `POST /v1/me/password` cambia la contraseña (con la actual) o crea la primera de una cuenta de Google solo con la sesión de 10 minutos o menos (403 `REAUTH_REQUIRED`); cierra las otras sesiones. `GET /v1/auth/session` suma `hasPassword`. Entrar con Google restaura la cuenta vinculada con eliminación pendiente. Alternativas: código numérico, reutilizar `email_verifications`, abrir sesión al restablecer, confirmar con el correo escrito. Ver [docs/adr/0033-restablecer-contrasena-y-reautenticacion.md](adr/0033-restablecer-contrasena-y-reautenticacion.md). |
| ADR-034 | Plan de compra: recomendaciones calculadas en el cliente y lista guardada en el teléfono (aceptado el 23 de noviembre de 2026; propuesto el 17 y renumerado el 22) | El plan recomienda en lugar de pedir parámetros: la más barata (1, 2 o 3 tiendas), todo en una tienda, la más cercana y la más barata del municipio; una opción con más tiendas solo aparece si cuesta menos y una que no cubre toda la lista nunca se llama «la más barata». El traslado se dice con una frase y el rodeo (1,3) y la velocidad (4,5 km/h) son fijos; domicilio solo con la tarifa que escribe la persona. La lista se guarda en `localStorage` (`valora:planes`, v1), sin coordenadas de la persona. Sin cambios de backend. Ver [docs/adr/0034-plan-de-compra-recomendaciones-en-el-cliente.md](adr/0034-plan-de-compra-recomendaciones-en-el-cliente.md). |
| ADR-035 | Plan de compra: consultar por municipio y calcular la cercanía en el dispositivo (aceptado el 22 de noviembre de 2026) | El plan pide la comparación siempre por municipio con la misma URL (caché compartida de Vercel, ADR-031) y calcula distancia y radio en el teléfono: cambiar el radio no hace solicitudes y la ubicación no sale del dispositivo. Una consulta por producto, no por lote. Verificado por una E2E que cuenta solicitudes. Ver [docs/adr/0035-consulta-por-municipio-y-cercania-en-el-dispositivo.md](adr/0035-consulta-por-municipio-y-cercania-en-el-dispositivo.md). |
| ADR-036 | Correo de bienvenida (propuesto, 23 de noviembre de 2026) | Un correo informativo por cuenta, cuando su correo queda verificado por primera vez (enlace de verificación, alta con Google, vínculo con Google o restablecer contraseña). Columna `identity.accounts.welcome_email_sent_at` (migración 0044), marcada de forma atómica antes de enviar; las cuentas existentes quedan marcadas y no lo reciben. Se envía en segundo plano: un fallo del proveedor no rompe el flujo y no se reintenta. Sin promoción, baja ni seguimiento; base legal: ejecución del servicio solicitado. Ver [docs/adr/0036-correo-de-bienvenida.md](adr/0036-correo-de-bienvenida.md). |
| ADR-037 | Plausibilidad del precio oficial: rechazo automático y revisión sin referencia (propuesto, 24 de noviembre de 2026) | Hallazgo H19: el precio oficial de un comercio se compara con la referencia de ADR-030 (mediana de 3 tiendas del municipio o SIPSA, mismos parámetros). Claramente fuera de rango: 422 `IMPLAUSIBLE_OFFICIAL_PRICE` con el rango en el mensaje y no se guarda nada. Sin referencia: se acepta «en revisión» (no es oficial ni titular) y entra a la cola con el motivo `sin_referencia`; aprobar lo publica, descartar lo retira. Aplica a `PUT /v1/commerce/prices`, la carga CSV y las promociones (lado bajo). Tablas `commerce.official_price_reviews` y `reliability.official_reviews` (migración 0045). Ver [docs/adr/0037-plausibilidad-del-precio-oficial.md](adr/0037-plausibilidad-del-precio-oficial.md). |
| ADR-038 | Estado final de las decisiones de moderación y causa visible de la suspensión (propuesto, 24 de noviembre de 2026) | Hallazgos H34, H33, H31 y H15. `aprobar` deja el aporte vigente; `descartar` y `observar_cuentas` lo retiran (`descartado`) de la cola, la tienda, la comparación y el historial; `observar_cuentas` además suspende 7 días a la cuenta, sin bajar su reputación. La sesión suma `suspension: { until, reason }`; la consulta de denuncias dice `alreadyReported`; una cuenta revocada ve un mensaje estándar, no la nota del moderador. Ver [docs/adr/0038-consecuencias-de-las-decisiones-de-moderacion.md](adr/0038-consecuencias-de-las-decisiones-de-moderacion.md). |
| Proyecto | TypeScript como lenguaje principal | Backend desarrollado en TypeScript sobre NestJS (ADR-018). |
| ADR-012 | Despliegue: Docker en Render, base en Neon y PWA en Vercel (aceptado el 16 de noviembre de 2026) | El backend se despliega como una imagen descrita por un `Dockerfile` en el repositorio (contenedores como código, RNF-009 RN1; cambio del 15 de noviembre, que reemplaza «sin Docker en el MVP»). Render construye y corre la imagen y la orquesta (salud con `GET /v1/health`, reinicio, despliegue sin corte), descrito en `render.yaml`. La base es Neon (PostgreSQL administrado con PostGIS). Vercel sirve la PWA y **reenvía `/v1/*` a Render** (rewrite en `vercel.json`): el navegador ve un solo origen, la cookie de sesión no cambia y no hay CORS. La API debe configurar `trust proxy` para leer la IP real del cliente; si no, todos comparten los límites de intentos. Una sola copia en Render mientras el outbox corra dentro del proceso. Se mantiene: sin Docker para desarrollar (PostgreSQL local) y la CI con contenedores de servicio de PostgreSQL + PostGIS; sin Testcontainers. Almacenamiento de fotos: adaptador Supabase Storage implementado por PR #126; ADR-022 fue aceptado el 17-nov-2026; falta la prueba real de persistencia tras un redespliegue. La elección de Render como orquestación quedó confirmada por el equipo en PR #125. |
| Proyecto | Dos repositorios separados (backend y frontend) | Este repositorio es responsable de API y dominio; el frontend consume su contrato. |

## Pendientes de decisión

| Tema | Estado actual | No asumir |
|---|---|---|
| Valores de vigencia y score | ADR-005 aceptado; valores provisionales | TTL 7/14 días, corroboración 5 % y umbral de anomalía 40 % son hipótesis/provisionales y parametrizables. |
| Fotos en el despliegue | Adaptador `SupabaseImageStorage` integrado por PR #126; ADR-022 aceptado el 17-nov-2026 | Falta comprobar una foto real después de un redespliegue; el ping de `keepalive.yml` aún es un supuesto. |
| Automatización del despliegue | ADR-012 aceptado; workflow `deploy.yml` integrado | B#23 sigue abierto: la última corrida falló porque `DATABASE_URL` llegó vacía; repetir tres despliegues correctos después de configurar secretos y aprobación protegida. |
| Herramientas de pruebas y calidad | Jest/Supertest backend, Vitest frontend y SonarQube integrados en CI | Playwright E2E (B#17/F#27), k6 (B#35) y auditoría WCAG/usabilidad (F#28) siguen pendientes. |

## Versiones fijadas del entorno (H2-01, paso 1)

Estas versiones se fijaron al configurar el backend. ADR-018 decide el framework pero no fija la versión mayor, y PLAN_MAESTRO indica que la versión exacta de PostgreSQL se fija en implementación. Cambiar una de estas versiones requiere revisar su razón.

| Herramienta | Versión | Razón |
|---|---|---|
| NestJS | 11 (`@nestjs/*` ^11, `@nestjs/config` ^4) | NestJS 12 se publica solo como ESM y Jest no lo carga en un proyecto CommonJS (`Must use import to load ES Module` al importar `@nestjs/testing`). NestJS 11 sigue en CommonJS y funciona con Jest y ts-jest sin configuración extra. Revisar si el proyecto se migra a ESM. |
| TypeScript | 6 | TypeScript 7.0 trae solo el ejecutable `tsc`, sin la API programática que necesita el CLI de Nest (`nest build`); según el propio CLI, esa API vuelve en 7.1. TypeScript 6 exige declarar `rootDir` en `tsconfig.build.json`. |
| Validación de variables de entorno | `class-validator` + `class-transformer` | Se eligió frente a `zod`. ADR-018 y las reglas de API ya usan `class-validator` con `ValidationPipe` para los DTOs, así que no se agrega una segunda librería de validación. `@nestjs/config` acepta la función `validate` y `class-transformer` convierte `PORT` a número. |
| PostgreSQL | 17 | Versión del entorno local y de CI; la base de producción está en Neon (PostgreSQL + PostGIS, ADR-012). La conexión, migraciones y consultas PostGIS están integradas. |

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
- ADR-007 (catálogo canónico con presentaciones y unidad base) fue **aceptado el 11 de noviembre de 2026**; la regla de normalización se aplica en `src/domain/unit-price.ts` y el catálogo valida bases compatibles.

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
- **Límites:** solo `src/shared/database/` y las carpetas `infrastructure/` (de `shared` y de cada módulo) importan `drizzle-orm` o `pg`; `pnpm depcheck` lo verifica.
- **`db:seed`:** llega con la issue #13 (paso 4), cuando haya datos que sembrar.

## Bus de eventos con outbox (issue #43, decidido el 11 de noviembre de 2026)

Aplicación de ADR-015. El detalle está en `docs/decisiones/issue-43-outbox/`.

- **Bus propio y mínimo** en `src/shared/events/`, en lugar de `@nestjs/event-emitter` (que ADR-018 mencionaba como posibilidad). El outbox necesita saber si cada entrega funcionó, y esa librería no lo informa por defecto.
- **Repartidor:**
  - Revisa la bandeja cada `OUTBOX_POLL_INTERVAL_MS` (valor inicial **5000**, calibrable; EC-02 exige menos de 5 minutos).
  - Reintenta hasta `OUTBOX_MAX_ATTEMPTS` (valor inicial **5**, calibrable). Después, el evento queda **fallido** con su error, se registra en el log y no bloquea a los demás.
- **Repetidos:** la tabla común `shared.processed_events` (receptor, evento) se escribe en la misma transacción que el trabajo del suscriptor.
- **Pendientes:**
  - Definir la retención de `shared.outbox` y `shared.processed_events` cuando haya datos de volumen (ADR-003).
  - Construir la entrega síncrona de `PrecioOficialPublicado` (EC-02) con el módulo `commerce` (corte 3).
  - Bloquear filas (`FOR UPDATE SKIP LOCKED`) si algún día corre más de una copia de la API.

## Catálogo (issue #49, decidido el 11 de noviembre de 2026)

Aplicación de ADR-007 (aceptado el 11-nov-2026). El detalle está en `docs/decisiones/issue-49-catalogo/` y en el grill común `docs/decisiones/issue-13-catalogo-y-establecimientos/`.

- **Presentación tal como se escribe:** `quantity`, `unit` (`g`, `kg`, `ml`, `l` o `und`) y `packCount` (1 si no es un empaque). La unidad base la calcula `src/domain/unit-price.ts`. En el contrato, `BaseUnit` pasó a llamarse `Unit`.
- **Marca:** `brand` opcional.
- **Categorías:** lista cerrada en la tabla `catalog.categories`, cargada por migración. Cada categoría guarda si es fresca, para el TTL de ADR-005. La lista inicial tiene 8 categorías (4 frescas) y se cambia con una migración nueva. En la API se muestra como `{ code, name }`.
- **Código de barras:** único entre presentaciones (índice único). El dígito de control EAN-13 se valida en la issue #51.
- **Caché de `GET /v1/products/{productId}`:** `Cache-Control: public, max-age=300` y `ETag` (valor inicial calibrable con EC-04).
- **Pendiente:** agregar `brand` a `POST /product-requests` (RF-003 la pide) con la issue de solicitudes de producto.

## Semilla (issue #51, decidido el 11 de noviembre de 2026)

Aplicación de RF-014, ADR-011 y ADR-019. El detalle está en `docs/decisiones/issue-51-semilla/` y en `seed/README.md`.

- **Datos:** `seed/tiendas.csv` (OpenStreetMap, una consulta autorizada el 12-nov-2026, citada con «© colaboradores de OpenStreetMap, ODbL») y `seed/productos.csv` (lista que verifica el equipo). Son los mismos CSV que se revisan en Excel. No traen precios.
- **Módulo `imports`** (sin tablas propias): lee y valida los CSV, y guarda por los casos de uso públicos `ImportCatalog` e `ImportEstablishments`. No escribe tablas de otros esquemas.
- **Ids fijos** UUID v5 (`node:crypto`): tienda por `osm_id`; producto por nombre y marca; presentación por producto, cantidad, unidad y unidades del empaque. Repetir la semilla actualiza; no duplica.
- **Solo filas verificadas:** tiendas con `revisar = no`; productos con `verificar = no` y `responsable`.
- **Todo o nada:** con una fila verificada inválida no se guarda nada, y cada error nombra el archivo y la fila.
- **Nunca borra:** los registros que ya no están en los CSV se informan.
- **Trazabilidad** (RF-014 RN5): en los CSV y en el historial de Git; una fila verificada sin fuente o fecha se rechaza.
- **Códigos de barras:** GTIN de 8, 12, 13 y 14 dígitos con dígito de control (`src/domain/gtin.ts`).

## Búsqueda de productos (issue #52, decidido el 11 de noviembre de 2026)

Aplicación de RF-003 RN4 y ADR-003. El detalle está en `docs/decisiones/issue-52-busqueda/`.

- **Extensiones:** `unaccent` y `pg_trgm` se crean en la migración `0006`. En PostgreSQL 17 son «de confianza», así que no hace falta el usuario `postgres`.
- **Comparación:** cada palabra de `q` debe aparecer en el nombre o la marca, en cualquier orden y también como pedazo, sin distinguir tildes ni mayúsculas. Usa la función `catalog.search_text` (inmutable) y un índice GIN de trigramas. Los comodines `%` y `_` que escribe el usuario se buscan como texto.
- **Orden:** por `similarity` de `pg_trgm` y, en empate, por nombre. La medida favorece los nombres cortos: con «leche», «Galletas con leche» y «Leche deslactosada» empatan. Si el equipo quiere priorizar los nombres que empiezan por lo buscado, se agrega como un criterio más.
- **`q` o `barcode`, exactamente uno;** un código sin producto responde la lista vacía. `q` se recorta antes de validar, así que una búsqueda de solo espacios responde 400.
- **Caché:** `Cache-Control: public, max-age=30` (valor inicial calibrable).

## Establecimientos (issue #50, decidido el 11 de noviembre de 2026)

Aplicación de RF-005, ADR-003 y ADR-019. El detalle está en `docs/decisiones/issue-50-establecimientos/`.

- **Tipos:** `barrio`, `minimercado`, `supermercado` y `descuento` (el cuarto ya estaba en ADR-019 y en el prototipo del mapa). Los valores siguen en español, como estaban en el contrato.
- **Dirección** opcional; las coordenadas de la tienda son obligatorias y se devuelven en la API.
- **Ubicación de la tienda:** columna `geography(Point, 4326)` con índice GiST; la cercanía se calcula con `ST_DWithin` y `ST_Distance` (metros).
- **`GET /v1/establishments/nearby`:**
  - Radio de 0,5 a 3 km, con 2 por defecto (valores iniciales calibrables).
  - `lat` y `lng` validados; `limit` común (20 por defecto, 50 como máximo).
  - Respuesta con `Cache-Control: no-store`, como excepción a la caché de las lecturas públicas: la URL lleva la ubicación del usuario (EC-08).
- **Privacidad:** la ubicación del usuario solo existe como parámetro de la consulta. Una prueba de integración verifica que no aparece en la respuesta ni en el log, y que no se guarda ninguna fila.
- **`hasVerifiedProfile`** sale del contrato hasta el módulo comercial (corte 3).
- **Pendiente:** el estado de moderación (RF-005 RN7) y la detección de duplicados (RN3) se agregan con la issue de sugerencias de tiendas.

## Registro de reportes (issue #14, decidido el 12 de noviembre de 2026)

Aplicación de RF-006, RF-007, ADR-004, ADR-010 y ADR-015. El detalle está en `docs/decisiones/issue-14-registrar-reporte/`.

- **Módulos nuevos:** `pricing` (tabla `reports`, de solo inserción) y `comparison` (tabla `price_current`). Migraciones `0007_pricing` y `0008_comparison`: el plan proponía una sola, pero cada módulo entró con su propio ciclo.
- **Sin sesión hasta la #16:** `reporter_id` era opcional y no tiene llave foránea. Desde la #62 la ruta exige sesión de reportante y CSRF, y `reporter_id` es obligatorio en los reportes nuevos.
- **Idempotencia:**
  - `idempotency_key` (con índice único) y `request_hash` (SHA-256 de los campos) se guardan en el reporte y no caducan.
  - Misma clave y mismo cuerpo → 200 con el recibo original. Misma clave con otro cuerpo → 409 `IDEMPOTENCY_KEY_REUSED`.
  - Dos registros simultáneos con la misma clave los resuelve el índice único.
- **Validaciones de la #14:**
  - Formato → 400.
  - `observedAt` más de 5 minutos en el futuro → 422 `INVALID_OBSERVATION_DATE` (`src/domain/observation-date.ts`).
  - Presentación o tienda inexistentes → 422 `UNKNOWN_PRESENTATION` o `UNKNOWN_ESTABLISHMENT`. Se comprueban con `PresentationExists` y `EstablishmentExists`.
  - Quedan para la #29: la ventana de 24 h, el límite por usuario, `DUPLICATE_REPORT` y el 429.
- **Precio vigente:** gana el mayor `observedAt`; en un empate, el mayor `receivedAt` (`src/domain/current-price.ts`). El suscriptor de `comparison` bloquea la fila (`FOR UPDATE`) antes de decidir, para que dos eventos simultáneos no se pisen. El plan proponía repetir la regla en el `WHERE` del upsert; así la regla vive en un solo lugar.
- **Evento `PriceReported` versión 1:** `reportId`, `presentationId`, `establishmentId`, `priceCop`, `priceType`, `observedAt` y `receivedAt`. No lleva datos del reportante (EC-08).
- **`priceType`:** `normal` y `oferta`. `combo` sale del contrato hasta definir qué significa.
- **Errores 409:** el filtro común conserva el `code` propio de un 409.

## Orden neutral (issue #21, decidido el 12 de noviembre de 2026)

Aplicación de RF-009, EC-06 y ADR-009. El detalle está en `docs/decisiones/issue-21-orden-neutral/`. La regla es `rankOffers` en `src/domain/neutral-ranking.ts`.

- **Criterios:** `unit_price` (por defecto, lo pone la capa HTTP), `distance` y `recent`. El resultado devuelve el criterio usado.
- **Entrada:** la regla solo lee `establishmentId`, `presentationId`, `unitPrice`, `distanceMeters` y `observedAt` (`RankableOffer`). Es genérica: recibe los ítems completos y los devuelve ordenados, pero no puede leer nada comercial.
- **Desempate:**
  - `unit_price` → distancia → fecha más reciente → identificadores.
  - `distance` → precio por unidad → fecha → identificadores.
  - `recent` → precio por unidad → distancia → identificadores.
  - Los identificadores (`establishmentId`, luego `presentationId`) se comparan carácter por carácter: el orden es total y no depende del idioma de la máquina. El precio por unidad se compara con el valor exacto, no con el redondeado.
- **Vigencia:** la regla no la conoce. La #15 decide qué precios entran al orden (desactualizados y `onlyCurrent`).
- **Bases distintas:** si los resultados mezclan `100g`, `100ml` o `und`, la regla lanza `IncompatibleUnitsError` con cualquier criterio. El catálogo debe impedir esa mezcla al importar (issue aparte).
- **Evidencia:** pruebas de neutralidad (campos comerciales no cambian el puesto) y de determinismo (120 permutaciones dan el mismo orden).

## Comparación (issue #15, decidido el 12 de noviembre de 2026)

Aplicación de RF-008, RF-009, RF-010, ADR-004, ADR-005 y ADR-009. El detalle está en `docs/decisiones/issue-15-comparacion/`.

- **Datos de otros módulos:** `comparison` usa dos consultas públicas nuevas, `ProductForComparison` (`catalog`) y `EstablishmentsWithinRadius` (`establishments`), y lee solo su propia tabla `price_current`. `findNearby` y `findWithinRadius` comparten la misma consulta PostGIS; la nueva no tiene tope de resultados.
- **Radio y caché:** iguales a `/nearby`: de 0,5 a 3 km, 2 por defecto, y `Cache-Control: no-store` sin `ETag` (la URL lleva la ubicación, EC-08). Una prueba verifica que la ubicación no aparece en la respuesta ni en el log, y que no se guarda nada.
- **Vigencia:** TTL de 7 días para categorías frescas y 14 para el resto, en una sola constante de `comparison` (provisional, ADR-005). Un precio visto dentro del margen de relojes de la #14 («en el futuro») cuenta con edad cero.
- **Orden:** `rankOffers` (#21). Los desactualizados van al final, ordenados entre sí. Con `onlyCurrent` solo quedan los vigentes.
- **`isCheapest`:** el precio por unidad más bajo (valor exacto) entre los resultados no desactualizados que se muestran; si varios empatan, todos.
- **Fuera del contrato o aplazado:** `cheapestPriceCop` y `averagePriceCop` salen (eran precios totales de presentaciones distintas); `reliability` y `confirmations`, desde la #31; `promotions` vacío hasta el corte 3; `source` siempre `comunidad`.
- **Errores:** 400 (UUID, ubicación, radio, `sort`, `onlyCurrent`), 404 si el producto no existe, 200 con listas vacías si no hay precios, y 422 `INCOMPATIBLE_UNITS` si el producto mezcla bases (la #59 lo impedirá).

## Sesión, CSRF y roles (issue #16, decidido el 12 de noviembre de 2026)

Aplicación de RF-001, RF-002, ADR-014 y EC-08. El detalle está en `docs/decisiones/issue-16-sesion/`. Va en dos pull requests: cuentas y sesión (este), y `POST /reports` protegido (#62).

- **Sesión de servidor:** tabla `identity.sessions`; la cookie `valora_session` lleva un token aleatorio de 256 bits y la base guarda su SHA-256.
- **Ciclo de vida** (`src/domain/session-lifetime.ts`, valores provisionales): vence tras 7 días sin uso o 30 desde el inicio; `last_seen_at` se escribe como mucho cada 5 minutos; cada inicio de sesión crea una sesión y un token nuevos; cerrar sesión la revoca. Sin limpieza de sesiones vencidas por ahora.
- **Cookie:** `HttpOnly`, `Secure` siempre, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 días. Mismo origen y sin CORS: en producción Vercel reenvía `/v1/*` a Render (ADR-012).
- **CSRF:** `HMAC-SHA256(SESSION_SECRET, token de sesión)`, sin guardarlo; lo entrega `GET /auth/session` y lo exigen las rutas con sesión y `POST`, `PUT`, `PATCH` o `DELETE` (403 `CSRF_TOKEN_INVALID`).
- **Roles:** uno por cuenta (`reportante`, `comercio`, `moderador`); el registro siempre crea un `reportante`. Solo el `reportante` podrá registrar precios. Guard `SessionGuard` con `@Roles(...)`: 401 sin sesión y 403 `FORBIDDEN` con otro rol.
- **No revelar cuentas:** el inicio de sesión fallido responde siempre el mismo 401 y verifica un hash de relleno si la cuenta no existe; el registro con un correo existente responde 201 igual y no cambia nada.
- **Datos:** contraseña de 10 a 128 caracteres sin reglas de composición; correo sin espacios y en minúsculas; Argon2id con 19 MiB, 2 iteraciones y 1 hilo; consentimiento con `policy_version` (`2026-11`, provisional) y `policy_accepted_at`.
- **Límites** (valores provisionales, en memoria detrás del puerto `AttemptLimiter`): 5 fallos de inicio de sesión por correo, 20 intentos por IP y 10 registros por IP en 15 minutos; 429 con `Retry-After`. Al reiniciar el servidor vuelven a cero; detrás de un proxy hará falta `trust proxy`.
- **Dependencias:** `@node-rs/argon2` y `cookie` 1.x (la 2.x solo trae ESM y Jest no la carga en Node 22).
- **Filtro de errores:** un 403 y un 401 conservan su propio código y mensaje, como el 409; un 429 envía `Retry-After`.
- **`POST /reports` (#62):** `SessionGuard` con `@Roles('reportante')`; el reporte guarda la cuenta en `reporter_id`, que entra en la huella de idempotencia (la misma clave usada por otra cuenta responde 409). Migración `0010` con `CHECK (reporter_id IS NOT NULL) NOT VALID`: drizzle-kit la generó y se agregó `NOT VALID` a mano antes de aplicarla. La comparación sigue pública.

## Score de confiabilidad (issue #19, decidido el 13 de noviembre de 2026)

Aplicación de RF-011, ADR-005 y EC-03. El detalle está en `docs/decisiones/issue-19-score/`. La regla vive en `src/domain/reliability.ts`; todos los valores son provisionales y están en `RELIABILITY_PARAMS`.

- **Qué se califica:** el precio vigente de una presentación en una tienda, con los demás reportes de esa presentación y tienda.
- **Corroborar y contradecir:** otro reporte a ±5 % del candidato corrobora; más lejos, contradice. Solo cuentan reportes de la ventana de vigencia (edad ≤ TTL), del mismo tipo de precio, de otra cuenta y uno por cuenta (el más reciente).
- **Fórmula:** `score = factorEdad × limitar(0,5 × reputación + 0,5 × min(C, 3)/3 − 0,5 × min(D, 3)/3)`. `C` y `D` suman corroboraciones y contradicciones con peso `reputación / 0,5` de cada cuenta.
- **Edad:** `factorEdad = 1 − edad / (2 × TTL)`, contada desde el reporte más reciente entre el candidato y los que lo confirman.
- **Niveles:** `alta` desde 0,6, `media` desde 0,2 y `baja` por debajo (era 0,25; se bajó en la #31 porque un reporte solo caía a `baja` a la hora de llegar). `en_revision` lo decide la moderación (#32).
- **Reputación:** de 0 a 1, neutra en 0,5; +0,05 cuando otros confirman, −0,20 con un rechazo de moderación (`updateReputation`). Guardarla y usarla le toca a la #31, la #32 y la #33.
- **Privacidad:** el reportante llega como una clave opaca y la salida no lleva ninguna (RN5, EC-08).

## Precios anómalos (issue #20, decidido el 14 de noviembre de 2026)

Aplicación de RF-012 (RN1, RN3 y RN4), ADR-005 y EC-03. El detalle está en `docs/decisiones/issue-20-anomalos/`. La regla es `assessAnomaly` en `src/domain/anomaly.ts`; todos los valores son provisionales y están en `ANOMALY_PARAMS`.

- **Alcance:** rango frente a la mediana (RN1) y grupos coordinados (RN3). La ráfaga (RN2) va a la #29.
- **Referencias:** las arma la #31 (la misma tienda o la zona). Se filtran con `comparableReports` (`src/domain/report-window.ts`), compartido con el score: ventana de vigencia, mismo tipo de precio, otras cuentas y uno por cuenta. La #31 no debe pasar como referencia precios que ya están en revisión.
- **Rango:** sospechoso si `|precio − mediana| / mediana` es mayor que 40 %, hacia arriba o hacia abajo. Con número par de referencias, la mediana promedia los dos del medio.
- **Pocos datos:** con menos de 3 cuentas de referencia no se marca y se devuelve `sin_datos` con el número de referencias.
- **Coordinación:** 3 cuentas nuevas o más (menos de 7 días) con el mismo precio (±5 %), en 60 minutos, cuyo precio se aparta más del 40 % de la mediana calculada sin ellas. Gana sobre el rango. Si sin el grupo quedan menos de 3 referencias, `sin_datos`.
- **Salida:** `normal`, `sospechoso` (motivo `rango` o `coordinacion`) o `sin_datos`, con la mediana, la desviación y el número de referencias, sin claves de reportante (EC-08).
- **No borrar (RN4), regla para la #31:** `sospechoso` cambia el estado a «en revisión» y avisa a moderación (#32); ningún reporte se borra (los reportes son de solo inserción desde la #14).
- **Límite conocido:** cuentas nuevas que reportan el mismo precio falso espaciadas más de 60 minutos no forman grupo y pueden mover la mediana. Se revisa con el conjunto etiquetado de la #31 (80 % de detección).

## Confiabilidad en la comparación (issue #31, primera parte, decidido el 14 de noviembre de 2026)

Aplicación de RF-010, RF-011, RF-012, ADR-004, ADR-005, ADR-015 y EC-03. El detalle está en `docs/decisiones/issue-31-reliability/`. La segunda parte (conjunto etiquetado y 80 % de detección) es la #67.

- **Flujo:** `pricing` publica `PriceReported` v2; `reliability` lo evalúa, guarda la observación y la reputación, y publica `PriceAssessed` v1; `comparison` actualiza `price_current` con ese veredicto (ya no escucha `PriceReported`).
- **Clave seudónima:** `PriceReported` v2 lleva `reporterKey` = `HMAC-SHA256(REPORTER_KEY_SECRET, id de la cuenta)` y `reporterSince` (día de creación). `identity` la calcula (`ReporterIdentity`). `REPORTER_KEY_SECRET` es una variable nueva y no debe cambiar una vez en uso. Los `PriceReported` v1 no se evalúan.
- **`reliability`:** tablas `observations` (copia de cada reporte con su veredicto, solo inserción), `reputations` y `reputation_events` (un punto por reporte). No lee tablas de `pricing`.
- **Referencias:** primero la tienda; si no hay 3 cuentas, se completa con las tiendas a 1 km (`EstablishmentsAround`, provisional), sin los sospechosos de la zona. La coordinación se mira solo en la tienda. Ajuste al construir y calibración de la #67: los sospechosos de la misma tienda cuentan para formar un grupo coordinado, pero nunca entran a la mediana (`flagged` en `assessAnomaly`).
- **Sospechosos:** no reemplazan un precio existente; sin precio previo entran `en_revision` (columna `status` de `price_current`), van al final de la comparación, nunca son `isCheapest` y no salen con `onlyCurrent`. `sin_datos` se trata como normal.
- **Reputación:** sube (`corroborated`) cuando otra cuenta de la tienda coincide; cada reporte da su punto una vez; los sospechosos no dan ni reciben.
- **Lectura:** `ReliabilityOfPrices` calcula el nivel y las confirmaciones al consultar. Un precio sin observación (anterior a la #31) cuenta como `baja`.
- **TTL:** pasó al dominio (`ttlDaysFor` en `freshness.ts`); `catalog` expone `PresentationFreshness`.
- **Calibración:** el umbral de `media` bajó de 0,25 a 0,2: con 0,25, un reporte solo caía a `baja` a la hora de llegar.

## Medición de la detección (issue #67, 14 de noviembre de 2026)

- Conjunto etiquetado sintético de 100 reportes con 30 anómalos (`test/fixtures/reliability/`), medido con el caso de uso real de `reliability` contra `valora_test`. La prueba falla si la detección baja del 80 % (EC-03). `pnpm reliability:evaluate` imprime la tabla.
- Resultado: **28 de 30 detectados (93 %)** y **1 falso positivo de 70** (una promoción real de −43 % reportada como normal). Informe: `docs/calidad/deteccion-anomalos.md`.
- Calibración: los reportes en revisión ya no entran a la mediana (un ataque anterior movía la mediana y hacía ver anómalo un precio honesto). Los valores provisionales no cambiaron.

## Moderación (issue #32, 14 de noviembre de 2026)

Aplicación de RF-013 (RN1, RN2, RN3), EC-03 y EC-08. El detalle está en `docs/decisiones/issue-32-moderacion/`.

- **Dónde vive:** en `reliability`, no en un módulo `moderation` aparte (se corrigió `ARCHITECTURE.md`).
- **Marcar:** solo el rol `reportante`, una vez por cuenta y reporte (llave `report_id`, `flagger_key`); repetir responde 409 `ALREADY_FLAGGED`. Se guarda la clave seudónima de quien marca, nunca su cuenta.
- **Cola:** cada elemento es un reporte sin decisión, por `desviacion` (sospechoso) o `marcado`. Orden: desviación de mayor a menor, luego más marcas, y en empate el más antiguo. Muestra nombres de producto y tienda (`PresentationLabels` y `EstablishmentNames`), nunca quién reportó ni quién marcó.
- **Decisiones:** motivo obligatorio de 10 a 500 caracteres, en `moderation_log` (un trigger rechaza `UPDATE` y `DELETE`) con la clave seudónima del moderador. `aprobar` → el reporte cuenta como normal y se vuelve a publicar `PriceAssessed`. `descartar` → deja de contar, la reputación del autor baja 0,20 y `PriceWithdrawn` v1 lleva el precio confiable más reciente de la tienda (o `null`). `observar_cuentas` solo queda en la bitácora hasta la #33.
- **Comparación:** cada resultado lleva `reportId` para poder marcarlo.
- **Fuera de alcance:** suspensión por rechazos (RN6) y efecto de `observar_cuentas` (#33), apelación (RN4, #71), conflicto de interés con comercios (RN5, Corte 3).

## Roles y suspensión de cuentas (issue #33, 14 de noviembre de 2026)

Aplicación de RF-002, RF-013 (RN6), RNF-010, PR-14 y EC-08. El detalle está en `docs/decisiones/issue-33-roles-bloqueo/`.

- **Roles:** el consumidor es quien consulta sin sesión; no hay un valor de rol nuevo. Siguen `reportante`, `moderador` y `comercio` (Corte 3).
- **Suspensión:** sin rutas nuevas. `observar_cuentas` suspende al autor del reporte; un tercer `descartar` seguido sobre reportes del mismo autor también (RN6, regla `suspensionAfter` en `src/domain/suspension.ts`: un `aprobar` corta la racha, y vuelve a suspender en el sexto). Dura 7 días (provisional), revoca todas las sesiones y una nueva la extiende sin acortarla.
- **Integración:** `reliability` publica `ReporterSuspensionRequested` v1 (clave seudónima, motivo, fecha de fin) en la transacción de la decisión; `identity` lo escucha. `identity.accounts` gana `reporter_key` (la guarda `ReporterIdentity` al calcularla) y `suspended_until`.
- **Acceso:** el login de una cuenta suspendida responde 403 `ACCOUNT_SUSPENDED` solo con la contraseña correcta; una sesión de una cuenta suspendida responde 401. **Cambiado en la #71:** ahora la cuenta suspendida entra con una sesión limitada.
- **Evidencia:** matriz de 30 casos (80 desde la #26) y guardián de rutas (`docs/calidad/matriz-autorizacion.md`).
- **Fuera de alcance:** cambio de rol auditado y creación de moderadores (issue aparte); comercio limitado a su tienda (Corte 3).

## Cambio de rol auditado (issue #73, 14 de noviembre de 2026)

Aplicación de RF-002 (RN1, RN4). El detalle está en `docs/decisiones/issue-73-cambio-de-rol/`.

- **Ruta:** `POST /v1/moderation/roles` (solo moderador, con CSRF): correo, rol (`reportante` o `moderador`) y motivo de 10 a 500 caracteres. Un moderador no cambia su propio rol (409 `OWN_ROLE`); pedir el rol que ya tiene responde 409 `ROLE_UNCHANGED`; un correo desconocido, 404. Límite provisional de 20 cambios por moderador en 15 minutos.
- **Bitácora:** `identity.role_changes`, inmutable con un trigger, con ids de cuenta (sin correos) y sin llave foránea, para sobrevivir al borrado de una cuenta. Sin autor significa «sistema».
- **Primer moderador:** comando `pnpm identity:set-role <correo> <rol> "<motivo>"`, con el mismo caso de uso.
- **Conflicto de interés:** un moderador no decide sobre un reporte cuya clave seudónima es la suya (409 `OWN_REPORT`).

## Apelación de un reporte descartado (issue #71, 14 de noviembre de 2026)

Aplicación de RF-013 RN4 y EC-08. El detalle está en `docs/decisiones/issue-71-apelacion/`.

- **Rutas:** `POST /v1/reports/{reportId}/appeal` (solo el autor, una vez, con motivo, hasta 7 días después del descarte) y `GET /v1/me/reports/{reportId}/status` (el estado y hasta cuándo puede apelar, sin decir quién decidió). Un reporte de otra cuenta responde 404.
- **Cola:** motivo `apelacion`, primero que todo, con el motivo del autor. La decide un moderador distinto del que descartó (409 `SAME_MODERATOR`); `observar_cuentas` no aplica (422).
- **Aceptar:** el reporte vuelve a contar y a la comparación, el autor recupera 0,20 de reputación, el descarte cuenta como `aprobar` en la racha y se publica `ReporterSuspensionLifted` con la fecha que ese descarte habría puesto; `identity` levanta la suspensión solo si coincide. **Rechazar:** sin otro castigo.
- **Sesión limitada:** una cuenta suspendida inicia sesión, pero solo puede ver el estado de sus reportes, apelar, ver su sesión (`suspendedUntil`) y cerrarla (`@AllowSuspended`); lo demás responde 403 `ACCOUNT_SUSPENDED`. Cambia el acceso de la #33.
- **Persistencia:** tabla `reliability.appeals` y columna `stage` en `moderation_log` (migración `0016`).
- **Fuera de alcance:** la lista `GET /v1/me/reports`.

## Lista de mis aportes (issue #76, 14 de noviembre de 2026)

Aplicación de RF-006, RF-013 y EC-08. El detalle está en `docs/decisiones/issue-76-mis-aportes/`.

- **Fuente:** solo `reliability` (sus observaciones por la clave seudónima del autor, con nombres de `catalog` y `establishments`); no toca `pricing`. Un reporte aparece cuando se evalúa; los anteriores a la #31 no aparecen.
- **Forma:** producto, tienda, precio, tipo, fecha, estado (los 6 de la #71) y `appealableUntil`; el más reciente primero; `limit` (20, máximo 50) y cursor `before` con `nextBefore`.
- **Regla del estado:** una sola función (`reportStateOf`) para esta lista y para el estado de un reporte.
- **Acceso:** reportante, también con una cuenta suspendida; sin caché.

## Validaciones del reporte y ráfagas (issue #29, 15 de noviembre de 2026)

Aplicación de RF-006, RF-012 (RN2), RNF-014, PR-06 y EC-07. El detalle está en `docs/decisiones/issue-29-validaciones/`.

- **Ya cumplido desde la #14:** campos faltantes, precio entero entre 1 y 10.000.000 y formato `{ code, message }`.
- **Observación vieja:** un precio visto hace más de 24 horas se rechaza (422 `INVALID_OBSERVATION_DATE`), aunque venga de la cola sin conexión.
- **Duplicado:** la misma cuenta no reporta la misma presentación en la misma tienda dos veces en 60 minutos (409 `DUPLICATE_REPORT`); el reintento con la misma clave sigue devolviendo su recibo. **Cambiado en la #30:** cuenta por la hora de observación.
- **Ráfaga (RN2):** más de 20 reportes por hora desde una cuenta responde 429 con `Retry-After`, contado en la base. Al aceptar el reporte 20, `pricing` publica `ReportBurstDetected` y `reliability` pone esos reportes en la cola con el motivo `rafaga` (tabla `reliability.bursts`, migración `0017`).
- **Valores provisionales** en `REPORT_LIMITS` (`src/domain/report-limits.ts`).
- **Límite conocido:** dos reportes simultáneos de la misma cuenta pueden pasar los dos el límite (se cuenta antes de guardar).

## Un producto, una base de unidad (issue #59, 15 de noviembre de 2026)

Aplicación de RF-004 y EC-06.

- `ImportCatalog` rechaza un producto cuyas presentaciones no comparten la base (`g`/`kg` → `100g`; `ml`/`l` → `100ml`; `und` → `und`) con `MixedUnitBasesError` (`MIXED_UNIT_BASES`). La regla vive en `src/domain/unit-price.ts` (`baseOf`, `assertSameBase`) y reutiliza su tabla de unidades.
- `pnpm db:seed` nombra la fila que mezcla bases y no guarda nada (todo o nada, como las demás validaciones de la semilla).
- Así la comparación (#15, #21) nunca recibe bases mezcladas. La semilla actual no tiene ningún producto mezclado.

## Precios vigentes de un establecimiento (issue #28, 15 de noviembre de 2026)

Aplicación de RF-008, EC-02 y EC-04. El detalle está en `docs/decisiones/issue-28-precios-por-tienda/`.

- **Ruta:** `GET /v1/establishments/{establishmentId}/prices`, pública, en `comparison` (lee `price_current`). Trae la tienda y cada precio con la misma forma de la comparación, sin la distancia.
- **Contenido:** todos los precios de la tienda ordenados por producto; `onlyCurrent=true` quita los desactualizados y los en revisión. La confiabilidad usa el TTL de la categoría de cada presentación.
- **Caché:** `public, max-age=60` y ETag (304), porque la URL no lleva la ubicación del usuario.
- **Consultas públicas nuevas:** `EstablishmentDetails` (establishments) y `PresentationsForPricing` (catalog); `PresentationLabels` ahora reutiliza la misma consulta.

## Inspección de privacidad (issue #36, 15 de noviembre de 2026)

Aplicación de EC-08, RNF-007, PR-15 y Ley 1581. El detalle está en `docs/decisiones/issue-36-privacidad/` y el informe en `docs/calidad/privacidad-ec08.md`.

- Correo y contraseña solo en `identity`; la única columna geográfica es la ubicación de la tienda; ninguna tabla guarda IP; `reliability` usa claves seudónimas.
- `pricing.reports.reporter_id` (id de la cuenta) se deja como referencia interna documentada: nunca sale en respuestas ni eventos.
- Dos pruebas guardianas (esquema y respuestas públicas) impiden que una migración o una ruta nueva rompa la privacidad sin que se note.

## Sincronización sin conexión, lado del servidor (issue #30, 15 de noviembre de 2026)

Aplicación de RF-007, EC-07, RNF-013, PR-07, PR-08 y ADR-010. El detalle está en `docs/decisiones/issue-30-sincronizacion/` y la medición en `docs/calidad/sincronizacion-ec07.md`.

- **Sin ruta de lotes:** la cola manda cada reporte a `POST /v1/reports` con su clave; el servidor ya era idempotente.
- **Cambia la #29:** el duplicado y la ráfaga cuentan por la hora de observación, no de llegada (`burstAt` en `src/domain/report-limits.ts`). Al reconectar, la cola ya no choca con el límite.
- **Medición:** 50 reportes, 150 envíos (repetidos, simultáneos y en desorden): 50 recibidos, 0 duplicados, el precio vigente correcto en cada tienda y p95 de confirmación de alrededor de 1 s en el servidor local.
- **Regla de reintentos de la cola**, documentada en el contrato de `POST /v1/reports`.
- **Error corregido:** dos envíos simultáneos con la misma clave hacían que el segundo respondiera 409 `DUPLICATE_REPORT`; ahora responde como reintento.
- **Límite conocido:** se pueden repartir horas de observación falsas dentro de las 24 h para evitar la ráfaga.

## Propuestas de tiendas (issue #27, 15 de noviembre de 2026)

Aplicación de RF-005 (RN1, RN3, RN4, RN7) y EC-08. El detalle está en `docs/decisiones/issue-27-propuestas-de-tiendas/`.

- **Ya cumplido desde la #50:** consulta por radio ordenada por distancia, ubicación del usuario no guardada y lat/lng de la tienda.
- **Revisión por módulo (común con la #26):** `establishments` guarda sus propuestas y tiene sus rutas de moderador; el moderador tiene tres listas (precios, tiendas, productos).
- **Ciclo:** `POST /v1/establishment-proposals` (reportante, pendiente, no aparece en el mapa); `GET /v1/moderation/store-proposals` con posibles duplicados y marca de zona; decisión `aprobar` (crea la tienda con el id de la propuesta), `fusionar` (con una tienda existente) o `rechazar`, con motivo.
- **Duplicados:** nombre equivalente (sin tildes, mayúsculas ni palabras comunes; las palabras de uno contenidas en el otro) a menos de 50 m. **Zona:** rectángulo aproximado del Quindío; fuera, la propuesta llega marcada. Valores provisionales, reglas en `src/domain/store-proposal.ts`.
- **Persistencia:** `establishments.store_proposals` (migración `0018`), con la clave seudónima de quien propone y del moderador. La prueba de privacidad del esquema ahora acepta también la ubicación de una tienda propuesta.

## Propuestas de productos, alias e imágenes (issue #26, 15 de noviembre de 2026)

Aplicación de RF-003 (RN2, RN3, RN4), RF-004, ADR-020 (aceptado después, el 15 de noviembre) y EC-08. El detalle está en `docs/decisiones/issue-26-propuestas-de-productos/`.

- **Imágenes:** solo un enlace con su fuente (`open_food_facts` o `equipo`) y su atribución, cargado desde `productos.csv`. Sin imagen, el frontend muestra la ilustración genérica. Subir fotos queda en una issue aparte (depende de ADR-012 y ADR-020).
- **Alias:** vienen de la columna `alias` de la semilla y de cada fusión (el nombre propuesto queda como alias). La búsqueda también mira los alias.
- **Ciclo:** `POST /v1/product-requests` (reportante, pendiente, no aparece en la búsqueda; 409 `BARCODE_TAKEN` si el código ya es de un producto); `GET /v1/moderation/product-requests` con hasta 5 posibles duplicados; decisión `aprobar` (crea el producto con el id de la propuesta), `fusionar` (respeta la base de unidad de la #59) o `rechazar`, con motivo.
- **Duplicados:** los primeros 5 resultados de la búsqueda con el nombre y la marca. Como la búsqueda exige todas las palabras, solo sugiere los casi idénticos; el moderador busca los demás.
- **Código tomado mientras esperaba:** aprobar o fusionar responde 409 `BARCODE_TAKEN`; la propuesta solo se puede rechazar.
- **Persistencia:** `catalog.product_aliases` y las columnas de imagen (migración `0019`), y `catalog.product_requests` (migración `0020`), con la clave seudónima de quien propone y del moderador.

## El duplicado dice cuándo reportar de nuevo (issue #84, 15 de noviembre de 2026)

Aplicación de RF-006 (RN5) y PR-06. El detalle está en `docs/decisiones/issue-84-duplicado-disponible/grill.md`.

- **El 409 `DUPLICATE_REPORT` trae `availableFrom`:** la hora de observación desde la que se acepta otro reporte de esa presentación en esa tienda, y el mensaje la dice en hora de Colombia.
- **No es `Retry-After`:** el duplicado se mide por la hora de observación (#30); reintentar el mismo reporte nunca pasa.
- **Regla:** `nextAllowedObservation` en `src/domain/report-limits.ts`.
- **Formato de error:** `ConflictError` en el contrato, solo para este código; el esquema `Error` sigue igual.

## Historial de precios (issue #83, 15 de noviembre de 2026)

Aplicación de RF-008 (RN1, RN3, RN4), EC-02, EC-04 y EC-08. El detalle está en `docs/decisiones/issue-83-historial/`.

- **Datos:** tabla propia `comparison.price_history` (migración `0021`), llenada con `PriceAssessed` y `PriceWithdrawn`; ningún módulo lee tablas de otro.
- **Serie:** una por presentación, por día en hora de Colombia, de los últimos 30 días, con mínimo, promedio y cantidad. Regla `dailyHistory` en `src/domain/price-history.ts`.
- **Qué cuenta:** no cuentan los descartados ni los sospechosos sin aprobar.
- **Fuente:** cada punto dice `reportado`; los oficiales llegan con `commerce` (Corte 3).
- **Datos anteriores:** `pnpm comparison:rebuild-history` vuelve a entregar los eventos ya entregados solo al receptor del historial (`OutboxRelay.redeliver`); se puede repetir.
- **Caché:** pública de 5 minutos con ETag.

## Fotos de productos (issue #88, 15 de noviembre de 2026)

Aplicación de ADR-020 (aceptado ese día), RF-003 y EC-08. El detalle está en `docs/adr/0020-imagenes-productos.md` y `docs/decisiones/issue-88-fotos-productos/plan.md`.

- **Ruta:** `PUT /v1/moderation/products/{productId}/image`, solo moderador; `multipart/form-data` con `file`. 400 sin archivo o si no es JPEG, PNG o WebP; 413 `PAYLOAD_TOO_LARGE` con más de 2 MB; 404 si el producto no existe.
- **Proceso:** `sharp` la reduce a 800 px como máximo, la guarda en WebP y descarta los metadatos (también la ubicación).
- **Almacenamiento:** puerto `ImageStorage`; hoy una carpeta del servidor (`MEDIA_DIR`) servida en `MEDIA_PUBLIC_URL` con caché de un año (el nombre cambia con la foto). En Render el disco se borra en cada despliegue (ADR-012): el adaptador del almacenamiento definitivo está pendiente.
- **Semilla:** si `productos.csv` no trae imagen, ya no borra la foto subida.
- **Pendiente:** borrar el archivo anterior al reemplazar una foto; fotos del comercio (Corte 3).

## Referencia SIPSA (issue #34, 15 de noviembre de 2026)

Aplicación de RF-014 (RN1 a RN5), ADR-011 y PR-20. El detalle está en `docs/decisiones/issue-34-sipsa/`.

- **Carga:** `seed/sipsa.csv`, llenado a mano desde el boletín del DANE y cargado por `pnpm db:seed` (solo filas verificadas, todo o nada, sin duplicar). Sin descarga automática.
- **Dónde vive:** `catalog.wholesale_references` (migración `0022`); `imports` no puede depender del núcleo, así que la referencia es un dato del producto. `comparison` la lee con `WholesaleReferenceOf`.
- **Comparable (RN2):** solo productos de peso (regla `acceptsWholesaleReference`); se muestra si su periodo terminó hace 30 días o menos (`isRecentReference`).
- **Cómo se ve (RN3):** `wholesaleReference` aparte en la comparación; no entra al orden ni a `isCheapest`; no muestra al responsable de la carga.
- **Fuera:** precios iniciales en la semilla (llegan como reportes) y la muestra de exactitud PR-22 (#93). *Actualizado el 17-nov-2026: la #135 permite precios iniciales marcados como «Dato inicial»; ver abajo.*

## Muestra de exactitud (issue #93, 15 de noviembre de 2026)

Aplicación de PR-22, RNF-014 y RF-014 (ISO/IEC 25012, exactitud). Decidido en el grill de la #34 (pregunta 4). Plan en `docs/decisiones/issue-93-exactitud/plan.md`.

- **Datos:** `seed/muestra-exactitud.csv`, llenado por el equipo; no se carga a la base.
- **Comando:** `pnpm quality:accuracy` escribe `docs/calidad/exactitud-pr22.md` con cada fila y un resumen (coincidencias, filas sin precio y mediana de la diferencia absoluta). Sin meta mínima (MC-E2).
- **Límites del monolito:** `imports` lee la muestra con los mismos ids fijos de la semilla (`seed-ids.ts`); `comparison` ofrece la consulta pública `CurrentPriceOf`; el comando solo las une. La cuenta la hace el dominio (`src/domain/price-accuracy.ts`).
- **Diferencia:** publicado menos observado, sobre el observado; también se informan los días entre las dos observaciones.

## Prueba de contrato (issue #25, 15 de noviembre de 2026)

Aplicación de PR-09 y ADR-002. El detalle está en `docs/decisiones/issue-25-contrato/grill.md`.

- **Herramienta:** `ajv` 2020 con `ajv-formats` y `yaml` (desarrollo). Ayudante en `test/support/contract.ts`.
- **Inventario:** toda ruta del código está en el contrato y al revés (salvo `/commerce`, corte 3).
- **Respuestas:** las rutas públicas, el registro de precios con sus errores, la sesión y mis aportes se validan en **modo estricto**: un campo que el contrato no nombra hace fallar la CI (EC-08).
- **Hallazgo:** `GET /v1/health` no estaba en el contrato; se documentó.

## Análisis estático con SonarQube (issue #24, 15 de noviembre de 2026)

Insumo de MC-E3. Proyecto en SonarQube Cloud (organización `juanjo0775`, plan Free, análisis automático apagado), creado por el equipo.

- **Configuración:** `sonar-project.properties` (deja fuera docs, migraciones, semilla e imágenes; las pruebas no cuentan como código por cubrir; cobertura de Jest en `coverage/lcov.info`).
- **Acciones de terceros fijadas por el SHA completo** (`pnpm/action-setup` v4.4.0 y `sonarqube-scan-action` v8.5.0): SonarQube lo pide y una etiqueta puede cambiar. El primer análisis falló por eso (Security Rating C).
- **CI:** job **SonarQube** después de **Pruebas**; toma la cobertura como artefacto y espera la regla de calidad (Sonar way). Si no se cumple, el job falla.
- **Ramas:** la CI corre también al llegar cambios a `dev` y `main`, para que SonarQube tenga con qué comparar cada pull request.
- **Secreto:** `SONAR_TOKEN` en GitHub; nunca en el repositorio.
- **Detalle en la CI:** el paso «Detalle de SonarQube» imprime la regla de calidad, los hallazgos por severidad, los bloqueantes y críticos y los puntos de seguridad por revisar (`.github/scripts/sonar-detalle.sh`).
- **Hallazgos graves del primer análisis de `dev` y su acción:** `secrets:S6698` (BLOCKER), contraseña de la base de la CI escrita en `ci.yml` → ahora cambia en cada corrida y no queda en el código. `typescript:S4790` (CRITICAL), SHA-1 en `stable-id.ts` → falso positivo: lo exige el UUID versión 5 y no protege datos; se excluye solo en ese archivo, con la razón en `sonar-project.properties`.
- **Pendiente:** marcar SonarQube como verificación obligatoria en «Proteger dev y main» después del primer análisis en verde.

## Filtro por municipio (issue #106, 15 de noviembre de 2026)

Aplicación de RF-009 RN5, RF-005 y EC-08. El detalle está en `docs/decisiones/issue-106-municipio/grill.md`.

- **Municipio de cada tienda:** columna `municipality` con la lista cerrada de los 12 municipios del Quindío (`src/domain/municipality.ts`, migraciones `0023` y `0024`). Las tiendas de la semilla son de Armenia; en una tienda propuesta lo elige el reportante y pasa a la tienda al aprobarla.
- **Comparación:** parámetro `municipality`. Con municipio, la ubicación es opcional (se compara sin compartir dónde está uno, EC-08); sin ubicación no hay `distanceM` ni `radiusKm` en los criterios y `sort=distance` responde 400.
- **Respuestas:** la tienda trae `municipality` en la comparación, la cercanía y los precios por tienda.
- **Fuera:** filtro por municipio en «tiendas cercanas» y cálculo del municipio con polígonos municipales.

## Canasta básica de hoy (issue #120, 16 de noviembre de 2026)

Aplicación de RF-008, RF-009, EC-04, EC-06 y EC-08 para la pantalla de Inicio del frontend.

- **Qué productos entran:** decisión de la usuaria: los que más tiendas del municipio tienen con precio vigente. Sin lista a mano ni columnas nuevas en la semilla.
- **Ruta:** `GET /v1/featured-products?municipality=…&limit=…`, pública, en `comparison` (lee `price_current`). No cuelga de `/products` porque `/products/{productId}` es de `catalog` y Express tomaría «featured» como un id. `limit` va de 1 a 50, con 5 por defecto.
- **Precios que cuentan:** como la comparación con `onlyCurrent=true`: solo vigentes (ni por confirmar, ni desactualizados, ni en revisión). Sin promociones (ADR-009).
- **El más bajo de cada producto:** valor exacto del precio por unidad, con los desempates de la comparación (`rankOffers`).
- **Orden declarado en `criteria` (EC-06):** más tiendas primero (`sort: store_count`); en empate, el precio por unidad que se muestra (entre bases distintas es solo un desempate estable) y el id del producto. La regla vive en `src/domain/featured-products.ts`.
- **Módulos:** `catalog` expone `ProductSummaries` (nombre, marca y categoría) y la tienda sale de `EstablishmentsWithinRadius.findInMunicipality`; ningún módulo lee tablas de otro.
- **Caché:** pública de 60 s con ETag (EC-04). Sin `reportId` ni datos de quién reportó (EC-08).
- **Por revisar si crece:** el caso de uso lee todo `price_current` y filtra por municipio en memoria. Con pocos miles de filas basta; si crece, se filtra en la consulta.

## Canasta del Inicio por ubicación, por categoría y con el ahorro (issue #128, 16 de noviembre de 2026)

Aplicación de RF-005, RF-008, RF-009, EC-04, EC-06 y EC-08 para el rediseño del Inicio y del detalle (decisión de la usuaria: ubicación real y el ahorro lo calcula el backend).

- **Área:** como la comparación (#106): `municipality`, `lat` y `lng` con `radiusKm`, o las dos cosas. `radiusKm` va de 0,5 a 3 km con **1,5 km por defecto** (la comparación usa 2 km por defecto; el Inicio del prototipo muestra 1,5 km). Sin ubicación el radio no se usa.
- **Privacidad (EC-08):** con la ubicación, `Cache-Control: no-store`; la ubicación solo elige las tiendas del radio, no se guarda, no va al log ni a la respuesta (prueba de integración con el registro real de NestJS). La respuesta solo trae `distanceM` de la tienda. Sin ubicación sigue la caché pública de 60 s con ETag (EC-04).
- **Categoría:** `category=<code>` filtra por el código de la lista cerrada. Un código desconocido responde la lista vacía (no 400): ningún otro filtro de lectura valida códigos de categoría contra el catálogo y así no hace falta consultarlo.
- **Ahorro (EC-06):** regla `savingsPercent` en `src/domain/savings.ts`: (más caro − más barato) / más caro × 100 por precio por unidad, con los valores exactos (`UnitPrice.percentBelow`) y redondeado al entero con la mitad hacia arriba. Solo con dos tiendas distintas o más; con bases que no se comparan no sale.
  - En la canasta, cada producto trae `priciest` (el más caro, con su tienda) y `savingsPercent`, entre sus precios vigentes del área.
  - En la comparación, `savingsPercent` a nivel de respuesta, entre los resultados que pueden ser el más barato: los mismos de `isCheapest` (vigentes y por confirmar, sin desactualizados ni en revisión). Así el porcentaje habla del mismo «más barato» que se muestra.
- **`storesWithPrices`:** tiendas del área con algún precio vigente, de cualquier categoría (no cambia con el filtro de categoría), para «Precios de 7 tiendas a menos de 1,5 km».
- **Módulos:** las tiendas del radio salen de `EstablishmentsWithinRadius.find`, la misma consulta pública de la comparación; ningún módulo lee tablas de otro.

## Cuántos precios tiene cada tienda en las listas (issue #131, 16 de noviembre de 2026)

Para las tarjetas del mapa nuevo del frontend («9 precios»). RF-005, RF-008, EC-04 y EC-08.

- **Qué cuenta `priceCount`:** las presentaciones con precio hoy en la tienda, con el mismo criterio que `GET /v1/establishments/{id}/prices?onlyCurrent=true`: no cuentan los desactualizados ni los que están en revisión; los por confirmar sí. Lo decide `PriceCounts` en `comparison`, con `price_current` y la consulta pública `PresentationsForPricing` de `catalog`.
- **Dónde viven las rutas:** `GET /v1/establishments` y `GET /v1/establishments/nearby` pasan de `establishments` a `comparison` (`EstablishmentListsController`), como ya pasaba con los precios de una tienda (grill de la #28). Las tiendas salen de las consultas públicas `SearchEstablishments` y `ListNearbyEstablishments`. Así `establishments` no depende de `comparison` y no hay ciclo.
- **Contrato:** un esquema nuevo, `EstablishmentWithPrices`, solo para las dos listas. `Establishment` no cambia, así que la comparación y los precios de una tienda siguen igual. Va sin `allOf` porque la prueba de contrato no admite campos de más.
- **Caché y privacidad:** iguales que antes (5 minutos para la lista; `no-store` para las cercanas, que llevan la ubicación del usuario). Ningún dato del reportante.

## Nombre visible de la cuenta (issue #133, 16 de noviembre de 2026)

Para el «Hola, Sara» del «Yo» del frontend. RF-001, RF-002, EC-08 y ADR-014.

- **Obligatorio al registrarse:** `displayName`, de 2 a 40 caracteres después de quitar los espacios sobrantes; solo letras (con tildes y ñ), espacios, apóstrofo y guion. Sin números, correos ni símbolos, así no cabe un teléfono ni un correo. La regla vive en `domain/display-name.ts`; el DTO responde 400 con un solo mensaje.
- **Cuentas que ya existen:** quedan sin nombre (columna `display_name` nullable, migración 0025). La sesión no trae `displayName` hasta que haya una forma de ponerlo (no se pidió).
- **Solo en la propia sesión:** `GET /v1/auth/session` lo devuelve; ninguna otra respuesta lo incluye. Se lee con un puerto aparte (`DisplayNames`), no viaja en la sesión que reciben los demás módulos. `privacy-public-responses.spec.ts` lo verifica en las rutas públicas, la cola de moderación y los aportes propios.
- **Cambiarlo (extensión de ADR-014/029):** `PATCH /v1/me/profile` con `{ displayName }` responde 200 `{ displayName }` (`no-store`). Sesión y CSRF, sin contraseña, cualquier rol y también cuenta suspendida (es rectificación de un dato propio de bajo riesgo). Mismas reglas del registro (`domain/display-name.ts`, 400 `VALIDATION_ERROR`); un nombre igual responde 200. Tope de 10 cambios por cuenta por hora (`DISPLAY_NAME_CHANGES_PER_ACCOUNT`, 429). Sin migración: la columna ya existe.
- **Consentimiento:** la política de datos sigue en la versión provisional `2026-11` sin texto (grill de la #16). Cuando el equipo escriba el texto, debe mencionar el nombre visible entre los datos tratados.

## Fotos de Open Food Facts para la semilla (issue #119, 16 de noviembre de 2026)

Aplicación de ADR-020 (punto 1: Open Food Facts primero, citando la fuente; punto 8: nada de sitios de cadenas) y RF-003.

- **Comando del equipo, no del servidor:** `pnpm seed:imagenes` escribe en `seed/productos.csv`; `pnpm db:seed` carga después las fotos revisadas. Así el CSV sigue siendo lo que el equipo revisa y no hay llamadas externas en el servidor.
- **Solo el enlace:** `image_front_url` de la API v2 (`?fields=image_front_url`), con `imagen_fuente = open_food_facts` y `imagen_atribucion = Open Food Facts, CC BY-SA`. Un enlace que no es `https` cuenta como «sin foto», porque la semilla lo rechazaría.
- **No pisa nada:** un producto con imagen en cualquiera de sus filas no se consulta; un producto toma la foto de su primera presentación que la tenga (la semilla solo usa la primera).
- **Red separada de la regla:** `fillProductImages` recibe la consulta como función; las pruebas usan respuestas simuladas y nunca llaman a Open Food Facts. `fetch` nativo de Node 22, sin dependencias nuevas.
- **Cortesía con la API:** User-Agent `Valora/0.1 (proyecto universitario, semilla del catálogo)`, sin correo (EC-08), y 700 ms entre consultas (límite de 100 por minuto).
- **Hoy no trae fotos:** la semilla no tiene códigos de barras hasta la #118.

## Precios iniciales como «Dato inicial» (issue #135, 17 de noviembre de 2026)

**Reemplaza** la decisión de la #34 de no cargar precios iniciales en la semilla. Decisión de la usuaria del 16-nov-2026: datos para la demo, tomados de la página pública de D1 (el arroz Diana exacto y 9 equivalentes de marca D1).

- **Dónde:** `seed/precios-iniciales.csv`. `pnpm db:seed` pone cada fila en todas las tiendas revisadas de su cadena (27 tiendas D1 y 3 Carulla en Armenia; Carulla llegó con la #142). `imports` valida y reparte; `comparison` guarda (`ImportInitialPrices`). El comando une los dos, como `accuracy.ts`, porque `imports` no puede depender del núcleo.
- **Fuente propia:** `price_current.source` (migración 0026) es `comunidad` o `siembra`. La comparación lo devuelve en `source` (el contrato ya tenía `siembra`) y el frontend lo muestra como «Dato inicial».
- **Nunca reemplaza a la comunidad:** solo llena tiendas sin precio. Un reporte de la comunidad reemplaza al dato inicial. La escritura usa `setWhere source = 'siembra'`, para que una carrera no pise un precio de la comunidad.
- **No es un reporte:** no pasa por `pricing` ni por `reliability`. No sube la confianza ni la reputación, no entra a la moderación ni a las ráfagas, y no va al historial de 30 días. Vence con la vigencia de siempre, desde la fecha de consulta.
- **Sin cuenta de reportante (EC-08)** y **sin ofertas** (EC-06, ADR-009).
- **Riesgo:** el precio de la página es nacional y puede no ser el de la tienda de Armenia. Por eso se ve marcado y vence solo.
- **Carulla** (#142, 17-nov-2026): 20 precios de su página en las 3 tiendas Carulla de la semilla, con el mismo mecanismo. Se agregan 3 presentaciones que Carulla vende (papa pastusa 2500 g, aceite Premier 900 ml, chocolate Corona 200 g), porque ponerlas en otra presentación daría un precio por unidad falso. Quedan fuera las 3 ofertas, el banano y el plátano por unidad y la Coca-Cola sin tamaño.
- **Ara** no publica precios legibles sin rutas que su `robots.txt` prohíbe. **Éxito** bloqueó las consultas automáticas (Cloudflare). No se evadió ninguno de los dos.

## Prueba de humo (15 de noviembre de 2026)

Insumo de RNF-009 (el despliegue debe pasar pruebas de humo) y respuesta a «¿está todo conectado?».

- **Qué es:** `test/smoke/smoke.ts`, un script con `fetch` que recorre la API encendida con los datos de la semilla. No usa Jest: las pruebas de Jest vacían sus tablas y no prueban la semilla ni el outbox con el proceso real.
- **Modos:** completo (crea cuentas y un precio de prueba) y `--solo-lectura` (solo consultas públicas, para el sistema desplegado).
- **Primer resultado en `valora_dev`:** 22 de 22 pasos en verde con moderación; 7 de 7 en solo lectura. No apareció ningún error del sistema.
- **Fuera por ahora:** correrla en la CI. Entra cuando exista el despliegue (ADR-012).

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.

## Canasta del Inicio paginada por desplazamiento (22 de noviembre de 2026)

El Inicio solo alcanzaba 6 productos y «Ver más» llegaba a 20, aunque hay unos 150 con precio.

- **Contrato (aditivo):** `GET /v1/featured-products` acepta `offset` (entero ≥ 0, 0 por defecto) además de `limit` (1 a 50, 5 por defecto). La respuesta suma `total` (productos destacables con los mismos filtros: municipio o ubicación, radio y categoría) y `hasMore` (`offset + items.length < total`). Sin `offset` el cuerpo trae lo mismo de antes más esos dos campos.
- **Orden:** el de ADR-009 y B#120 (más tiendas, menor precio por unidad que se muestra, id), que es total: las páginas no repiten ni saltan productos. `offset` más allá del final responde 200 con `items` vacío.
- **Caché y privacidad:** sin cambios. Con `lat`/`lng`, `no-store` (EC-08); sin ubicación, caché pública de 60 s (ADR-031). `limit` y `offset` van en la query, que ya forma parte de la clave de caché, así que no hace falta `Vary`.
- **Eficiencia:** se calcula y ordena todo en memoria y solo se recorta la página (`pageFeaturedProducts`), con unos cientos de candidatos basta. Si el catálogo con precio pasa de unos pocos miles de productos, hay que pasar el conteo por producto, el orden y el recorte a la consulta.

## Consecuencias visibles de las decisiones de moderación (24 de noviembre de 2026)

Hallazgos H34, H33, H31 y H15 de la prueba de usuario del módulo de comerciante. El detalle y las alternativas están en el ADR-038.

- **H34, estado final.** `aprobar` deja el reporte `aprobado` (en «Mis aportes» es `normal`; la tienda lo muestra vigente). `descartar` y `observar_cuentas` lo dejan `descartado`: sale de la cola, de la tienda, de la comparación y del historial (`PriceWithdrawn`). Antes `observar_cuentas` dejaba el reporte sin estado final y seguía en revisión.
- **H33, causa visible.** `GET /v1/auth/session` suma `suspension: { until, reason }`; `suspendedUntil` se conserva. La regla de la suspensión no cambia. Migración 0046 (`identity.accounts.suspension_reason`).
- **H31.** `GET /v1/establishments/{id}/merchant-reports` responde `{ canReport: false, alreadyReported: true }` si la cuenta ya tiene una denuncia abierta sobre esa tienda.
- **H15.** `GET /v1/commerce/me` de una cuenta revocada trae un mensaje estándar en `reason`; la nota queda en la bitácora.
