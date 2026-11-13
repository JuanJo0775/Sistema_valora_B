# Plan — issue #19: score de confiabilidad y reputación

- **Rama:** `feat/domain-score-confiabilidad`, desde `dev`. Pull request hacia `dev` con `Closes #19`.
- **Decisiones:** `grill.md` de esta carpeta (8 preguntas).
- **Relación:** H2-02, épica #5. RF-011, ADR-005, EC-03, EC-08, PR-03.
- **Alcance:** solo `src/domain/`. No hay ruta, tabla ni evento nuevos, así que `docs/openapi.yaml` no cambia. Guardar la reputación y mostrar `reliability` y `confirmations` le toca a la #31; los rechazos de moderación, a la #32 y la #33.

## Archivos

| Archivo | Qué lleva |
|---|---|
| `src/domain/reliability.ts` | `RELIABILITY_PARAMS`, `ScoredReport`, `reliabilityScore`, `reliabilityLevel` y `updateReputation` |
| `src/domain/reliability.spec.ts` | Las pruebas de los ciclos de abajo |
| `docs/DECISIONS.md` | Sección «Score de confiabilidad (issue #19)» con el resumen del grill |
| `README.md` | Fila de la #19 en el estado |

## Ciclos TDD

Cada ciclo es un commit `test(domain): …` (rojo) y uno `feat(domain): …` (verde), más un `refactor(domain): …` solo si hay una refactorización real. Las pruebas usan cuentas neutras (0,5), un TTL de 14 días y precios recién vistos, salvo que el ciclo diga otra cosa.

| # | Comportamiento (nombre de la prueba) |
|---|---|
| 1 | Un reporte solo, de una cuenta neutra y recién visto, tiene score 0,25, sin corroboraciones ni contradicciones |
| 2 | Otra cuenta que reporta 4100 frente a 4000 (2,5 %) lo corrobora: el score sube a 0,42 |
| 3 | Otra cuenta que reporta 4500 frente a 4000 (12,5 %) lo contradice: el score baja a 0,08 |
| 4 | Los reportes de la misma cuenta que el candidato no cuentan, y cada otra cuenta cuenta una sola vez, con su reporte más reciente |
| 5 | Solo se compara el mismo tipo de precio: una oferta no contradice un precio normal |
| 6 | Un reporte más viejo que el TTL ni corrobora ni contradice |
| 7 | A partir de 3 corroboraciones equivalentes, una más no sube el score |
| 8 | Cada corroboración pesa según la reputación de su cuenta, y la reputación del candidato pesa en la base |
| 9 | El score decae en línea recta: 0,8 pasa a 0,6 a la mitad del TTL y llega a 0 a las 2 veces el TTL |
| 10 | La edad se cuenta desde el reporte más reciente entre el candidato y los que lo corroboran; una edad negativa cuenta como 0 |
| 11 | El nivel es `alta` desde 0,6, `media` desde 0,25 y `baja` por debajo |
| 12 | La reputación sube 0,05 con una corroboración, baja 0,20 con un rechazo y siempre queda entre 0 y 1 |

**Refactorización esperada:** cuando la fórmula junte reputación, corroboración y edad, se separan en funciones pequeñas con nombre de dominio (`evidenceOf`, `ageFactor`).

**Pruebas de caracterización:** se espera que pasen sin código nuevo. Se suben en un commit `test(domain): …` que lo dice en su mensaje. Si alguna falla, se vuelve un ciclo normal.

- Con otros parámetros (por ejemplo, tolerancia del 10 %), el resultado cambia: nada está fijo en el código (RN6).
- La salida no contiene ninguna `reporterKey` de la entrada (RN5, EC-08).
- Los escenarios de RF-011, escritos tal como están en Notion.

## Fuera de alcance

- Guardar la reputación y llamar a `updateReputation` (#31, #32 y #33).
- `en_revision` (moderación, #32).
- Detección de precios anómalos (#20, su propio pull request).

## Después

- **`docs/DECISIONS.md`** y **README**.
- **Notion:** EPIC-B05 con el avance, y RF-011 con el estado «En construcción».

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde, con `src/domain` al 80 % o más de líneas.
