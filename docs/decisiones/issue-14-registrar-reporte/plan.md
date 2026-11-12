# Plan — issue #14: `POST /v1/reports` con `Idempotency-Key`

- **Objetivo:** registrar un precio observado, sin duplicados ante reintentos, y dejar el precio más reciente en `price_current` a través del outbox.
- **Relación:** paso 5 del H2-01, épica #4, RF-006, RF-007, ADR-004, ADR-010, ADR-015, EC-01, EC-02, EC-04, EC-07, EC-08.
- **Fuera de alcance:**
  - Sesión, CSRF y `reporter_id` obligatorio (#16).
  - Ventana de 24 h, límite por usuario, `DUPLICATE_REPORT` y 429 (#29).
  - Ruta de comparación (#15); vigencia y confiabilidad en `price_current` (#31).
  - `combo`.

## Dependencias

Ninguna nueva. La huella del cuerpo usa `createHash('sha256')` de `node:crypto`.

## Rama y pull request

`feat/pricing-registrar-reporte`, que sale de `dev`. Un pull request hacia `dev` con `Closes #14`.

## Diseño

### `src/domain/` (TDD)

- **`observation-date.ts`:** `assertObservedAtAccepted({ observedAt, receivedAt })`. Lanza `InvalidObservationDateError` (ya existe en `freshness.ts`, se reutiliza) si `observedAt` está más de 5 minutos después de `receivedAt`.
- **`current-price.ts`:** `replacesCurrentPrice(candidate, current)`. Gana el mayor `observedAt`; en un empate, el mayor `receivedAt`; sin precio vigente, siempre reemplaza.

### `catalog` y `establishments` (soporte)

- `catalog` publica `PresentationExists`, y `establishments` publica `EstablishmentExists`. Cada una es una clase pública en `application/`, con su método en el repositorio del módulo, y se exporta en `index.ts` y en `exports` del módulo NestJS (mismo patrón que `ImportCatalog`).

### `pricing` (módulo nuevo, con `/nuevo-modulo`)

- **`infrastructure/schema.ts`:** `pgSchema('pricing')` con la tabla `reports`:
  - `id`, `presentation_id`, `establishment_id` (uuid, sin llaves foráneas a otros esquemas);
  - `reporter_id` (uuid, opcional hasta la #16);
  - `price_cop` (entero, `CHECK` de 1 a 10.000.000) y `price_type` (`CHECK`: `normal`, `oferta`);
  - `status` (`CHECK` de los cuatro estados, `recibido` por defecto);
  - `observed_at` y `received_at` (timestamptz);
  - `idempotency_key` (uuid, índice único) y `request_hash` (texto).
- **`application/`:**
  - Puertos: `ReportRepository`, `PresentationCatalog`, `EstablishmentDirectory` y `Clock`.
  - `register-report.ts`, caso de uso `RegisterReport`:
    1. Calcula la huella del cuerpo (con `priceType` ya resuelto y `observedAt` en ISO).
    2. Si la clave existe: misma huella → devuelve el recibo original con `created: false`; otra huella → `IdempotencyKeyReusedError`.
    3. Valida `observedAt` con la regla de dominio, usando la hora del reloj como `receivedAt`.
    4. Comprueba la presentación y la tienda (`UnknownPresentationError`, `UnknownEstablishmentError`, ambas con código para 422).
    5. Guarda el reporte y el evento `PriceReported`.
- **`infrastructure/drizzle-report-repository.ts`:** en una transacción, `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` y `OutboxPublisher.publish`. Si la fila no se insertó (carrera de dos reintentos), lee la existente y el caso de uso decide igual que en el paso 2.
- **`http/`:** `ReportsController` con `POST /reports`, DTO con `class-validator`, cabecera `Idempotency-Key` validada como UUID. Responde 201 o 200 según `created`. Traduce `IdempotencyKeyReusedError` a 409.

### `comparison` (módulo nuevo, con `/nuevo-modulo`)

- **`infrastructure/schema.ts`:** `pgSchema('comparison')` con `price_current`:
  - llave (`presentation_id`, `establishment_id`);
  - `report_id`, `price_cop`, `price_type`, `observed_at` y `received_at`.
- **Suscriptor:** al iniciar el módulo se suscribe a `PriceReported` como `comparison.price_current`. Hace un upsert cuyo `WHERE` repite la regla `replacesCurrentPrice`, para que dos eventos simultáneos no dejen un precio viejo.
- `comparison` no importa nada de `pricing`: lee los datos del `payload` del evento.

### Ajuste en `src/shared/http/error.filter.ts`

Hoy todo 409 responde `code: CONFLICT`. Se cambia para que un 409 que trae su propio `code` lo conserve. Lleva su propio ciclo TDD.

### Migración

`0007_pricing-and-comparison`, generada con `pnpm db:generate --name pricing-and-comparison` y revisada.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y otro `feat(...)` (verde), más un `refactor` si hace falta.

**Dominio (Jest, sin base):**

1. Un precio visto 6 minutos en el futuro se rechaza.
2. Un precio visto 3 minutos en el futuro se acepta (margen de relojes).
3. Un reporte observado después del vigente lo reemplaza.
4. Un reporte tardío, observado antes del vigente, no lo reemplaza.
5. Con la misma hora de observación, gana el que llegó después.

**Soporte (integración con `valora_test`):**

6. `PresentationExists` dice sí o no según exista la presentación.
7. `EstablishmentExists` dice sí o no según exista la tienda.

**Caso de uso `RegisterReport` (dobles detrás de los puertos):**

8. Registra el reporte con `status: recibido` y la hora del reloj como `receivedAt`.
9. Rechaza una presentación o una tienda que no existen.
10. Rechaza un `observedAt` en el futuro.
11. Misma clave y mismo cuerpo: devuelve el recibo original y no guarda otro reporte.
12. Misma clave y otro cuerpo: `IdempotencyKeyReusedError`.

**Repositorio de `pricing` (integración):**

13. Guarda el reporte y el evento `PriceReported` en la misma transacción; el `payload` no trae `reporterId`.
14. Dos registros simultáneos con la misma clave dejan un solo reporte y un solo evento.

**`comparison` (integración):**

15. Un `PriceReported` crea la fila de `price_current`.
16. Un reporte tardío no reemplaza la fila; uno más reciente sí.

**Filtro de errores:**

17. Un 409 con su propio `code` lo conserva.

**HTTP (Supertest):**

18. 201 con la forma del contrato; el reintento idéntico responde 200 con el mismo cuerpo.
19. 409 `IDEMPOTENCY_KEY_REUSED`.
20. 400 sin `Idempotency-Key`, con `priceType: combo` o con `priceCop` fuera de rango.
21. 422 `UNKNOWN_PRESENTATION`, `UNKNOWN_ESTABLISHMENT` e `INVALID_OBSERVATION_DATE`.
22. **De punta a punta:** `POST /v1/reports`, luego `OutboxRelay.runOnce()`, y `price_current` queda con ese precio.

## Después

- `docs/openapi.yaml` según `contrato-api.md`.
- **`docs/DECISIONS.md`:** sección de la #14 (margen de 5 minutos, clave en el reporte, `combo` quitado, `PriceReported` v1).
- **README:** los módulos `pricing` y `comparison` en «Estado» y en la estructura.
- **`.claude/rules/arquitectura-monolito-modular.md`:** los eventos se nombran `PrecioReportado`, pero los identificadores van en inglés. Propongo corregirlo a `PriceReported` (en la carpeta raíz `Valora`, fuera de este repositorio).
- **Notion (texto que te muestro antes de aplicarlo):**
  - ADR-004: `Estado` pasa a «Aceptado», con `Fecha de decisión` 2026-11-12, y «Decisión adoptada» cambia «PROPUESTA: B)…» por «B)…» y agrega: «`price_current` vive en el módulo `comparison` y lo actualiza el evento `PriceReported` por el outbox (ADR-015), con segundos de retraso (`OUTBOX_POLL_INTERVAL_MS`). Gana el reporte con el mayor `observedAt` (issue #14).»
  - Fila de la #14 en su épica: «PR abierto…» y luego «Terminado…».

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- Los criterios de la #14 cubiertos por pruebas:
  - reintento idéntico (ciclos 11, 14 y 18) y 409 (ciclos 12 y 19);
  - `observedAt` y `receivedAt` por separado (ciclo 8);
  - `PriceReported` por outbox y `price_current` actualizado (ciclos 13, 15 y 22);
  - el reporte tardío no reemplaza (ciclos 4 y 16).

## Riesgo

El pull request va a pasar de 400 líneas: son dos módulos nuevos, una migración y 22 ciclos. Si queda muy grande, se puede partir en dos pull requests: «`pricing` y la ruta» y «`comparison` y `price_current`». Eso exige partir la issue, porque la regla es «una issue, un pull request».
