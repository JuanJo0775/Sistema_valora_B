# Plan — issue #50: establishments, directorio con ubicación

- **Objetivo:** módulo `establishments`, creado siguiendo `/nuevo-modulo`, con su tabla en PostGIS y `GET /v1/establishments/nearby`.
- **Relación:** issue padre #13, épica #3, RF-005, ADR-003, ADR-019 (propuesto), ADR-021, EC-04, EC-05, EC-08.
- **Fuera de alcance:**
  - Sugerir tiendas, moderación y detección de duplicados (RN3, RN7).
  - Perfil de comercio (corte 3).
  - Semilla (#51).

## Dependencias

Ninguna nueva. PostGIS ya está activo desde la migración `0000` (#42).

## Rama y pull request

`feat/establishments-directorio`, que sale de `dev`. Un pull request hacia `dev` con `Closes #50`.

## Diseño (`src/modules/establishments/`)

- **`index.ts`:** solo exporta `EstablishmentsModule`.
- **`application/`:**
  - `establishment-repository.ts`: puerto con un solo método, `findNearby({ lat, lng, radiusMeters, limit })`.
  - `list-nearby-establishments.ts`: caso de uso que convierte el radio a metros y pide las tiendas cercanas. No tiene reglas de negocio propias; la distancia la calcula PostGIS.
- **`infrastructure/`:**
  - `schema.ts` con `pgSchema('establishments')` y la tabla `establishments`:
    - `id` (uuid), `name`, `type` (con `CHECK` de los 4 tipos) y `address` (opcional);
    - `location` de tipo `geography(Point, 4326)` (columna propia de Drizzle con `customType`), con índice GiST.
  - `drizzle-establishment-repository.ts`: consulta con `ST_DWithin` (dentro del radio), `ST_Distance` (distancia en metros, redondeada), orden por distancia y `limit`. Devuelve `lat` y `lng` de la tienda.
- **`http/`:**
  - `establishments.controller.ts`: `GET /establishments/nearby`.
  - DTO de entrada con `class-validator`: rangos de `lat`, `lng`, `radiusKm` y `limit`, con los mensajes en español del formato común.
  - DTO de salida explícito, con la cabecera `Cache-Control: no-store`.
- **Privacidad (EC-08):** el módulo no tiene ninguna escritura en esta ruta. La ubicación del usuario solo existe en la consulta SQL, como parámetro. No se registra en el log ni aparece en la respuesta.
- **Migración:** `0005_establishments`, generada con `pnpm db:generate --name establishments` y revisada.

## Ciclos TDD

Cada ciclo es un commit `test(establishments)` (rojo) y otro `feat(establishments)` (verde), más un `refactor` si hace falta. Las pruebas de integración crean sus propias tiendas de prueba en `valora_test`, con coordenadas conocidas de Armenia y nombres de prueba («Tienda de prueba A»…), y vacían la tabla antes de cada prueba.

**Repositorio (integración con PostGIS):**

1. Devuelve las tiendas dentro del radio, ordenadas de la más cercana a la más lejana, con su distancia en metros y sus coordenadas.
2. Deja fuera las tiendas que están más lejos que el radio.
3. Respeta el límite de resultados.

**HTTP (Supertest):**

4. Responde 200 con la forma del contrato, usa 2 km si no se envía el radio y lleva `Cache-Control: no-store`.
5. Responde 400 `VALIDATION_ERROR` si falta `lat`, si `lat` o `lng` están fuera de rango, o si el radio está fuera de 0,5 a 3 km.
6. **Privacidad:** después de una consulta, la respuesta no contiene la ubicación consultada, el log no la registra y no hay filas nuevas en la base.

## Después

- `docs/openapi.yaml` según `contrato-api.md`.
- **Documentación:**
  - `DECISIONS.md`: tipos, radio, límites y la caché `no-store`.
  - README: el módulo en la estructura y en «Estado».
  - Esta carpeta de decisiones.
- **Notion (texto que te muestro antes de aplicarlo):**
  - Descripción de RF-005, que hoy dice «El sistema mantiene un directorio de tiendas, minimercados y supermercados con nombre, tipo, dirección y coordenadas…». Pasaría a «El sistema mantiene un directorio de tiendas de barrio, minimercados, supermercados y tiendas de descuento con nombre, tipo, coordenadas y, cuando se conoce, dirección…». El resto de la descripción no cambia.
  - **[EPIC-B03]:** la fila de la #50 pasa a «PR abierto…» y luego a «Terminado…».

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- Los criterios de #50 cubiertos por pruebas: coordenadas en la respuesta (ciclos 1 y 4) y ubicación no guardada ni expuesta (ciclo 6).
