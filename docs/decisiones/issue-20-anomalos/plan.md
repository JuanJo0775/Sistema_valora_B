# Plan — issue #20: detección de precios anómalos

- **Rama:** `feat/domain-precios-anomalos`, desde `dev`. Pull request hacia `dev` con `Closes #20`.
- **Decisiones:** `grill.md` de esta carpeta (7 preguntas).
- **Relación:** H2-02, épica #5. RF-012 (RN1, RN3 y RN4), ADR-005, EC-03, EC-08, PR-04.
- **Alcance:** solo `src/domain/`. No hay ruta, tabla ni evento nuevos, así que `docs/openapi.yaml` no cambia. La ráfaga (RN2) va a la #29; guardar el estado y medir el 80 % de detección, a la #31; la cola de moderación, a la #32.

## Archivos

| Archivo | Qué lleva |
|---|---|
| `src/domain/report-window.ts` | Filtro común: ventana de vigencia, mismo tipo de precio, otra cuenta y uno por cuenta (sale de `reliability.ts`) |
| `src/domain/anomaly.ts` | `ANOMALY_PARAMS`, `AnomalyInput`, `AnomalyResult` y `assessAnomaly` |
| `src/domain/anomaly.spec.ts` | Las pruebas de los ciclos de abajo |
| `docs/DECISIONS.md` | Sección «Precios anómalos (issue #20)», con la regla de no borrar para la #31 |
| `README.md` | Fila de la #20 en el estado |

## Primero: refactorización del score

`refactor(domain): …` que mueve `comparableReports` de `reliability.ts` a `report-window.ts`, sin cambiar su comportamiento. Las 24 pruebas de `reliability.spec.ts` siguen en verde.

## Ciclos TDD

Cada ciclo es un commit `test(domain): …` (rojo) y uno `feat(domain): …` (verde), más un `refactor(domain): …` solo si hay una refactorización real. Las pruebas usan un TTL de 14 días, precios normales recién vistos y cuentas creadas hace un año, salvo que el ciclo diga otra cosa.

| # | Comportamiento (nombre de la prueba) |
|---|---|
| 1 | Con menos de 3 cuentas de referencia no marca: devuelve `sin_datos` y cuántas había |
| 2 | Un precio dentro del 40 % de la mediana es `normal`, con la mediana, la desviación y las referencias |
| 3 | Un precio que se aparta más del 40 %, hacia abajo o hacia arriba, es `sospechoso` por `rango`; justo el 40 % no |
| 4 | Con un número par de referencias, la mediana es el promedio de los dos del medio |
| 5 | Solo cuentan como referencia los reportes de la ventana, del mismo tipo de precio, de otras cuentas y uno por cuenta |
| 6 | Cuatro cuentas nuevas que reportan 1500 en 10 minutos, frente a una mediana de 5000, son `sospechoso` por `coordinacion` |
| 7 | Cuentas nuevas que coinciden con el precio habitual no son sospechosas |
| 8 | Cuentas antiguas, o reportes separados por más de 60 minutos, no forman grupo coordinado |
| 9 | Si un reporte cumple rango y coordinación, gana `coordinacion` |

**Pruebas de caracterización:** se espera que pasen sin código nuevo. Se suben en un commit `test(domain): …` que lo dice en su mensaje. Si alguna falla, se vuelve un ciclo normal.

- La regla no modifica la lista que recibe (RN4).
- La salida no contiene ninguna clave de reportante (EC-08).
- Con otros parámetros el resultado cambia (RN6).
- Los escenarios de RF-012 de rango y de grupo coordinado, tal como están en Notion.

## Otras tareas

- **Comentario en la #29:** que incluya RN2 de RF-012 (ráfaga: bloqueo temporal por exceso de reportes por hora).
- **Notion:** EPIC-B05 con el avance y RF-012 con el estado «En construcción».

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde, con `src/domain` al 80 % o más de líneas.
