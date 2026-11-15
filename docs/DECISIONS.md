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
| ADR-014 | Sesiones administradas por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No sustituir por JWT bearer sin una nueva decisión aprobada. |
| ADR-015 | Eventos de dominio internos con outbox (aceptado el 11 de noviembre de 2026) | El evento se guarda en la tabla outbox del esquema `shared` en la misma transacción que el cambio; un repartidor del mismo proceso lo entrega al menos una vez y los receptores ignoran repetidos. `PrecioOficialPublicado` se procesa en la misma transacción (EC-02). Sin broker externo. |
| ADR-018 | Backend: NestJS sobre Express (aceptado el 8 de noviembre de 2026) | Las reglas de `domain` se escriben en TypeScript puro; su validación práctica es el esqueleto H2-01. |
| ADR-020 | Imágenes de productos (aceptado el 15 de noviembre de 2026) | Una imagen por producto: Open Food Facts, foto del equipo o ilustración genérica. En el Corte 2 solo el moderador sube fotos (JPEG, PNG o WebP hasta 2 MB; WebP de 800 px como máximo, sin metadatos). Almacenamiento detrás de un puerto: carpeta del servidor hasta ADR-012. Ver [docs/adr/0020-imagenes-productos.md](adr/0020-imagenes-productos.md). |
| ADR-021 | Acceso a datos: Drizzle ORM con migraciones SQL versionadas (aceptado el 11 de noviembre de 2026) | Tablas en `infrastructure/schema.ts` con un `pgSchema` por módulo; migraciones generadas con `drizzle-kit`, revisadas y versionadas; driver `pg`; solo `infrastructure/` y `shared/database` importan Drizzle. Ver [docs/adr/0021-acceso-datos-drizzle.md](adr/0021-acceso-datos-drizzle.md). |
| Proyecto | TypeScript como lenguaje principal | Backend desarrollado en TypeScript sobre NestJS (ADR-018). |
| Proyecto | Sin Docker en el MVP (registrado dentro de ADR-012, que sigue en discusión) | No añadir Dockerfile, Compose ni Testcontainers; los integrantes no necesitan Docker. **Aclaración del 11 de noviembre de 2026:** la CI de GitHub Actions sí puede usar contenedores de servicio con PostgreSQL + PostGIS para las pruebas. |
| Proyecto | Dos repositorios separados (backend y frontend) | Este repositorio es responsable de API y dominio; el frontend consume su contrato. |

## Pendientes de decisión

| Tema | Estado actual | No asumir |
|---|---|---|
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
- **Cookie:** `HttpOnly`, `Secure` siempre, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 días. Mismo origen y sin CORS hasta decidir el despliegue (ADR-012).
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
- **Almacenamiento:** puerto `ImageStorage`; hoy una carpeta del servidor (`MEDIA_DIR`) servida en `MEDIA_PUBLIC_URL` con caché de un año (el nombre cambia con la foto). El proveedor llega con ADR-012.
- **Semilla:** si `productos.csv` no trae imagen, ya no borra la foto subida.
- **Pendiente:** borrar el archivo anterior al reemplazar una foto; fotos del comercio (Corte 3).

## Referencia SIPSA (issue #34, 15 de noviembre de 2026)

Aplicación de RF-014 (RN1 a RN5), ADR-011 y PR-20. El detalle está en `docs/decisiones/issue-34-sipsa/`.

- **Carga:** `seed/sipsa.csv`, llenado a mano desde el boletín del DANE y cargado por `pnpm db:seed` (solo filas verificadas, todo o nada, sin duplicar). Sin descarga automática.
- **Dónde vive:** `catalog.wholesale_references` (migración `0022`); `imports` no puede depender del núcleo, así que la referencia es un dato del producto. `comparison` la lee con `WholesaleReferenceOf`.
- **Comparable (RN2):** solo productos de peso (regla `acceptsWholesaleReference`); se muestra si su periodo terminó hace 30 días o menos (`isRecentReference`).
- **Cómo se ve (RN3):** `wholesaleReference` aparte en la comparación; no entra al orden ni a `isCheapest`; no muestra al responsable de la carga.
- **Fuera:** precios iniciales en la semilla (llegan como reportes) y la muestra de exactitud PR-22 (#93).

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
- **Pendiente:** marcar SonarQube como verificación obligatoria en «Proteger dev y main» después del primer análisis en verde.

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.
