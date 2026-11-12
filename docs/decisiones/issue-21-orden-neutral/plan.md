# Plan — issue #21: función de orden neutral

- **Rama:** `feat/domain-orden-neutral`, desde `dev`; pull request hacia `dev` con `Closes #21`.
- **Decisiones:** `grill.md` de esta carpeta (8 preguntas).
- **Alcance:** solo `src/domain/`. No hay ruta nueva ni cambio de base de datos, así que `docs/openapi.yaml` no cambia en este pull request. La #15 describirá el desempate en el parámetro `sort` cuando construya la ruta.

## Archivos

| Archivo | Qué lleva |
|---|---|
| `src/domain/neutral-ranking.ts` | `SortCriterion`, `RankableOffer` y `rankOffers` |
| `src/domain/neutral-ranking.spec.ts` | Las pruebas de los ciclos de abajo |
| `docs/DECISIONS.md` | Sección «Orden neutral (issue #21)» con el resumen del grill |
| `README.md` | Fila de la #21 en el estado |

## Ciclos TDD

Cada ciclo es un commit `test(domain): …` (rojo) y uno `feat(domain): …` (verde). Hay commit `refactor(domain): …` solo si hay una refactorización real.

| # | Comportamiento (nombre de la prueba) |
|---|---|
| 1 | Por precio por unidad, la tienda más barata por 100 g va primero, y el resultado dice que usó `unit_price` |
| 2 | Con el mismo precio por unidad, va primero la tienda más cercana |
| 3 | Con el mismo precio y la misma distancia, va primero el precio visto más recientemente |
| 4 | Si todo empata, decide `establishmentId` y luego `presentationId`, comparados carácter por carácter |
| 5 | Por distancia, la tienda más cercana va primero, y el empate sigue con precio, fecha e identificadores |
| 6 | Por fecha (`recent`), el precio más reciente va primero, y el empate sigue con precio, distancia e identificadores |
| 7 | Ofertas con bases distintas (`100g` y `und`) se rechazan con `IncompatibleUnitsError`, con cualquier criterio |
| 8 | La lista de entrada no cambia: la regla devuelve una nueva |

**Refactorización esperada:** después de los ciclos 5 y 6, las tres cadenas repiten las mismas comparaciones. Se extrae una tabla de comparadores por criterio (DRY: tres veces).

**Pruebas de caracterización:** se espera que estas pasen sin código nuevo. Se suben en un commit `test(domain): …` que lo dice en su mensaje; no se presentan como un ciclo rojo-verde. Si alguna falla, se vuelve un ciclo normal.

- Dos precios que se muestran iguales ($412) pero difieren en el valor exacto se ordenan por el valor exacto.
- Sin ofertas, devuelve la lista vacía con el criterio usado.
- Neutralidad (decisión 7): una promoción o un perfil comercial no cambian el puesto de una tienda, con los tres criterios.
- Determinismo (decisión 8): las 120 permutaciones de cinco ofertas dan el mismo orden, con cada criterio.

## Fuera de alcance

- No se valida `distanceMeters` (negativa o no numérica): lo calcula PostGIS en la #15.
- La vigencia y `onlyCurrent` se resuelven en la #15 (decisión 4).

## Otras tareas

- **Issue nueva para el catálogo (decisión 5):** «la importación del catálogo rechaza un producto con presentaciones de bases distintas». Queda lista para que otro integrante la implemente.
- **Notion:** al mezclar, se actualiza la épica EPIC-B06 con el avance de la #21.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov` en verde, con `src/domain` al 80 % o más de líneas.
