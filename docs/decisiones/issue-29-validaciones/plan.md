# Plan — issue #29: validaciones del reporte y ráfagas

- **Rama:** `feat/pricing-validaciones` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #29`.
- **Relación:** Corte 2, épica #4. RF-006, RF-012 (RN2), RNF-014, PR-06, EC-07, EC-08.
- **Decisiones:** `grill.md` (3 preguntas). Contrato y evento: `contrato-api.md`.
- **Ya cumplido desde la #14:** campos faltantes, precio entero mayor que cero y formato de error (se citan en el pull request).
- **Dependencias nuevas:** ninguna.

## Diseño

1. **Dominio:** observación de más de 24 horas (`observation-date.ts`) y límites de aportes (`REPORT_LIMITS`: 60 minutos para el duplicado, 20 por hora para la ráfaga; segundos de espera).
2. **`pricing`:** el repositorio da los reportes de una cuenta en la última hora. `RegisterReport` rechaza el duplicado (409) y la ráfaga (429), y al aceptar el reporte 20 publica `ReportBurstDetected`.
3. **`reliability` (migración `0017_reliability-bursts`):** tabla `bursts`; suscriptor de `ReportBurstDetected`; la cola y el estado del aporte cuentan la ráfaga.
4. **HTTP:** 409 `DUPLICATE_REPORT`, 429 con `Retry-After` y 422 por fecha vieja en `POST /v1/reports`.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Dominio:**

1. Un precio visto hace más de 24 horas se rechaza; justo 24 horas, no.
2. Con 20 reportes en la última hora, el siguiente espera hasta que el más viejo salga de la ventana; con 19, no espera.

**`pricing`:**

3. **Persistencia (integración):** los reportes de una cuenta desde una fecha.
4. La misma cuenta, presentación y tienda en 60 minutos con otra clave es un duplicado; el reintento con la misma clave sigue devolviendo su recibo.
5. El reporte 21 de la hora se rechaza con los segundos de espera y no se guarda.
6. Al aceptar el reporte 20 se publica `ReportBurstDetected` con la clave seudónima y los reportes de esa hora.

**`reliability`:**

7. **Persistencia (integración):** los reportes de una ráfaga entran a la cola y al estado del aporte.
8. **Suscriptor (integración):** `ReportBurstDetected` por el outbox marca los reportes.
9. **Cola:** motivo `rafaga`, después de `desviacion` y antes de `marcado`.
10. **Estado:** un reporte de una ráfaga sin decisión está «en revisión».

**HTTP:**

11. `POST /v1/reports`: 409 `DUPLICATE_REPORT`, 429 con `Retry-After` y 422 por una observación vieja.
12. **De punta a punta:** 20 reportes de una cuenta en distintas tiendas; el 21 responde 429; el moderador ve 20 elementos `rafaga` sin datos de la cuenta (EC-08).

## Otras tareas

- **Documentos:** `openapi.yaml`, `ARCHITECTURE.md` (evento nuevo), README y `DECISIONS.md`.
- **Notion:** la épica de pricing, RF-006 y RF-012.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build`, `test:cov --runInBand` y `reliability:evaluate` en verde.
