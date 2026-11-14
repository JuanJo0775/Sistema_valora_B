# Plan — issue #31: aplicar vigencia, confiabilidad y anómalos a `price_current`

- **Objetivo:** que cada reporte pase por `reliability` antes de llegar a la comparación, que los sospechosos no aparezcan como vigentes sin advertencia y que la comparación muestre `reliability` y `confirmations`.
- **Relación:** Corte 2, épica #5. RF-010, RF-011, RF-012, ADR-004, ADR-005, ADR-015, EC-03, EC-08, PR-11.
- **Decisiones:** `grill.md` (9 preguntas). Contrato y eventos: `contrato-api.md`.
- **Dos pull requests** (pregunta 1). El primero va con `Refs #31`; el segundo resuelve la #67 y cierra la #31.

## Primer pull request: el flujo completo

- **Rama:** `feat/reliability-aplicar-reglas` (ya creada desde `dev`).
- **Dependencias nuevas:** ninguna.
- **Configuración nueva:** `REPORTER_KEY_SECRET` en `.env.example`, validada al arrancar, y en la CI.

### Diseño

1. **`identity`:** consulta pública `ReporterIdentity.of(accountId)` → `{ reporterKey, reporterSince }`. La clave es `HMAC-SHA256(REPORTER_KEY_SECRET, accountId)`.
2. **`pricing`:** `RegisterReport` publica `PriceReported` v2 con `reporterKey` y `reporterSince`, que pide a `identity` con la cuenta de la sesión.
3. **`establishments`:** consulta pública `EstablishmentsAround({ establishmentId, radiusMeters })` → ids de las tiendas cercanas (PostGIS).
4. **`reliability` (módulo nuevo, con `/nuevo-modulo`):**
   - **Esquema:** `observations`, `reputations` y `reputation_events` (pregunta 3 y 8). Migración `0011_reliability`.
   - **`AssessReportedPrice`** (suscriptor de `PriceReported` v2):
     1. Arma las referencias: misma tienda; si no hay 3 cuentas, la zona de 1 km. Excluye los sospechosos (pregunta 7).
     2. Aplica `assessAnomaly` (la coordinación, solo con la tienda).
     3. Guarda la observación con su veredicto.
     4. Si no es sospechoso, aplica `corroborated` a las cuentas que coinciden, una vez por reporte (pregunta 8).
     5. Publica `PriceAssessed` v1 en la misma transacción.
   - **`ReliabilityOfPrices`** (consulta pública): nivel y `confirmations` de cada precio con `reliabilityScore` y `reliabilityLevel` a la hora actual (pregunta 6).
   - **Parámetros provisionales:** radio de la zona (1 km) en un solo lugar.
5. **`comparison`:**
   - El suscriptor pasa de `PriceReported` a `PriceAssessed`.
   - `price_current` gana la columna `status` (`vigente` o `en_revision`). Un sospechoso no reemplaza un precio existente; si no hay ninguno, entra `en_revision` (pregunta 5). Migración `0012_comparison-status`.
   - `CompareProduct` recibe un puerto nuevo hacia `ReliabilityOfPrices`; los `en_revision` van al final con `reliability: en_revision` y nunca son `isCheapest`.
6. **Contrato:** `docs/openapi.yaml` según `contrato-api.md`.
7. **Reglas de dependencia:** `reliability` (núcleo) usa `identity` y `establishments` por su `index.ts`; `comparison` usa `reliability` por su `index.ts`; `reliability` no conoce a `comparison` ni a `pricing` (solo el evento).

### Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay una refactorización real. Una prueba que pase sin código nuevo se sube como caracterización y su commit lo dice.

**Soporte:**

1. `ReporterIdentity`: la misma cuenta da siempre la misma clave; otra cuenta u otro secreto, otra clave; la clave no contiene el id.
2. `EstablishmentsAround` devuelve las tiendas a 1 km o menos y no las más lejanas (integración).

**`pricing`:**

3. `PriceReported` v2 lleva `reporterKey` y `reporterSince`, y sigue sin id de cuenta, correo ni ubicación.

**`AssessReportedPrice` (dobles detrás de los puertos):**

4. Un reporte cerca de la mediana de la tienda queda `normal`, se guarda y publica `PriceAssessed` con ese veredicto.
5. Un precio fuera de rango queda `sospechoso` por `rango`.
6. Con menos de 3 cuentas en la tienda, usa la zona de 1 km.
7. Los reportes ya sospechosos no cuentan como referencia.
8. Un grupo de cuentas nuevas en la misma tienda queda `sospechoso` por `coordinacion`.
9. Un reporte que coincide con otro sube la reputación de los dos autores, una sola vez por reporte.
10. Un reporte sospechoso no da ni recibe reputación.

**`ReliabilityOfPrices`:**

11. Devuelve el nivel y las confirmaciones de cada precio con la reputación guardada y la hora actual.

**Repositorios de `reliability` (integración):**

12. Guardan y leen observaciones, reputaciones y eventos de reputación; un reporte no da su punto dos veces.

**`comparison`:**

13. Un `PriceAssessed` sospechoso no reemplaza un precio vigente; sin precio previo, entra `en_revision` (integración).
14. `CompareProduct` pone los `en_revision` al final, sin `isCheapest`, y muestra `reliability` y `confirmations` de los demás.

**HTTP y punta a punta:**

15. La comparación responde con `reliability` y `confirmations` según el contrato.
16. **De punta a punta:** dos reportantes reportan precios parecidos, el outbox entrega `PriceReported` y `PriceAssessed`, y la comparación muestra el precio con `confirmations: 1`; un precio fuera de rango no reemplaza al vigente.
17. **Privacidad (EC-08):** las tablas de `reliability` y los eventos no guardan el id de la cuenta ni el correo.

### Después

- `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` (el flujo `pricing → reliability → comparison`) y el README.
- **Notion:** EPIC-B05 y RF-010, RF-011 y RF-012.

## Segundo pull request: el conjunto etiquetado (PR-11)

- **Rama:** `test/reliability-conjunto-etiquetado`, desde `dev` después de mezclar el primero. `Closes #67` y `Closes #31`.
- **Contenido:** `test/fixtures/reliability/labeled-reports.csv` y su `README.md`; la prueba de integración que exige 80 % o más; `pnpm reliability:evaluate`; el informe `docs/calidad/deteccion-anomalos.md`; la calibración de parámetros si hace falta, documentada (pregunta 9).

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde, con `src/domain` al 80 % o más de líneas.
