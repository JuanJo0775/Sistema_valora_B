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
- **Sin sesión hasta la #16:** `reporter_id` es opcional y no tiene llave foránea. La #16 agrega el guard de sesión y CSRF y lo vuelve obligatorio.
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

## Regla de cambio

Una propuesta tecnológica no se convierte en decisión por aparecer en un README, issue o rama. Para cerrar una decisión se requiere ADR con contexto, alternativas, decisión, consecuencias, responsables y aceptación del equipo.
