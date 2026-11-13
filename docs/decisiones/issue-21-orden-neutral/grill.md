# Grill — issue #21: función de orden neutral de la comparación

- **Fuentes:**
  - Issue #21 (H2-02, épica #6): regla pura que ordena con un criterio declarado y un desempate determinista. Criterios de aceptación: el orden no depende de atributos comerciales; las promociones van aparte y no lo alteran; el resultado dice qué criterio se usó; mismas entradas, mismo orden; ciclo TDD visible.
  - RF-009, EC-06 (neutralidad) y PR-05; ADR-009 (promociones aparte).
  - `docs/openapi.yaml`: parámetro `sort` de `/products/{productId}/comparison` (`unit_price`, `distance`, `recent`; por defecto `unit_price`), `Comparison.criteria` y `ComparisonItem.freshness` («desactualizado no entra al orden»).
  - `docs/ARCHITECTURE.md`: «`commerce` no puede alterar el orden neutral de resultados».
  - Código existente: `src/domain/unit-price.ts` (`UnitPrice.compareTo` con el valor exacto; lanza `IncompatibleUnitsError` si las unidades no coinciden) y `src/domain/freshness.ts`.
  - Grill de la #15, pregunta 1: la #21 va primero, en su propio pull request.
- **Fecha:** 2026-11-12.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Criterios:** la issue nombra precio por unidad y distancia; el contrato agrega `recent`.
2. **Entrada:** qué datos recibe cada resultado. Solo los que deciden el orden, para que lo comercial no pueda entrar ni por error.
3. **Desempate:** la cadena de criterios secundarios y la clave final que hace el orden total.
4. **Desactualizados:** el contrato dice que no entran al orden. ¿Los quita la regla o van al final?
5. **Unidades distintas:** un producto con presentaciones en `100g` y en `und` no se puede comparar por precio por unidad.
6. **Salida:** cómo dice el resultado qué criterio se usó.
7. **Promociones:** cómo se prueba en el dominio que no alteran el orden, si las promociones aún no existen.
8. **Determinismo:** cómo se demuestra que el orden no depende del orden de entrada.

## Preguntas

### 1. ¿Qué criterios acepta la regla?

- **Decisión:** los tres del contrato: `unit_price` (por defecto), `distance` y `recent`.
- **Razón:** el contrato ya los publica y el frontend genera sus tipos desde él. Ninguno es comercial: salen del reporte o de la ubicación. Cada uno cuesta uno o dos ciclos TDD.

### 2. ¿Qué recibe la regla por cada resultado?

- **Decisión:** solo los datos que deciden el orden: `establishmentId`, `presentationId`, `unitPrice` (`UnitPrice`, con el valor exacto), `distanceMeters` y `observedAt` (tipo `RankableOffer`).
- **Razón:** lo que la regla no recibe no puede influir en el orden. Así la neutralidad (EC-06) queda en el tipo y no solo en la disciplina del equipo. La regla tampoco depende de la forma de la API.
- **Consecuencia:** la #15 arma estos datos, ordena y vuelve a unir cada resultado con el resto de su información. `distanceMeters` es obligatorio porque el contrato exige `lat` y `lng`; si la #15 decide otra cosa, se ajusta allá. La vigencia se decide en la pregunta 4.

### 3. ¿Cuál es la cadena de desempate?

- **Decisión:**

  | Criterio | 1.º | 2.º | 3.º | Final |
  |---|---|---|---|---|
  | `unit_price` | precio por unidad, menor primero | distancia, menor primero | más reciente primero | `establishmentId`, luego `presentationId` |
  | `distance` | distancia, menor primero | precio por unidad, menor primero | más reciente primero | igual |
  | `recent` | más reciente primero | precio por unidad, menor primero | distancia, menor primero | igual |

- **Razón:** después del criterio elegido decide lo que más le sirve al consumidor (precio y cercanía); la fecha va al final porque un precio más nuevo es más confiable. Los UUID son aleatorios, así que el desempate final no favorece a ninguna tienda; se comparan carácter por carácter, sin depender del idioma, para que el orden sea igual en cualquier máquina. El precio por unidad se compara con el valor exacto (`UnitPrice.compareTo`), no con el redondeado.

### 4. ¿Qué hace la regla con los precios desactualizados?

- **Decisión:** nada; la regla no sabe de vigencia. Ordena lo que recibe. La #15 calcula la vigencia con `freshnessOf` y decide qué entra al orden (los desactualizados y, con `onlyCurrent`, los por confirmar).
- **Razón:** una responsabilidad por pieza: `freshness.ts` dice qué tan viejo está un precio y la regla nueva dice en qué orden van. `RankableOffer` sigue con cinco datos.
- **Consecuencia:** el filtro se construye con TDD en el caso de uso de la #15. Allí se decide si los desactualizados se muestran al final o se ocultan (hueco 5 del grill de la #15).

### 5. ¿Qué pasa si los resultados tienen bases distintas (`100g`, `100ml`, `und`)?

- **Decisión:** la regla revisa al inicio que todos tengan la misma base y, si no, lanza `IncompatibleUnitsError` (ya existe), sin importar el criterio. El catálogo debe impedir la mezcla: se abre una issue aparte para que la importación rechace un producto con presentaciones de bases distintas.
- **Razón:** un producto representa una sola cosa; mezclar bases es un error de datos. El precio por unidad entra en el desempate de los tres criterios, así que el problema aparece con cualquier criterio. Agrupar por base daría un orden arbitrario entre grupos y mezclaría resultados que no se pueden comparar.
- **Consecuencia:** con la garantía del catálogo, la #15 nunca ve este error. Hoy el catálogo no la tiene.

### 6. ¿Qué forma tiene la salida?

- **Decisión:**

  ```ts
  type SortCriterion = 'unit_price' | 'distance' | 'recent';

  function rankOffers<T extends RankableOffer>(
    offers: readonly T[],
    sort: SortCriterion,
  ): { sort: SortCriterion; offers: T[] };
  ```

- **Razón:** el resultado dice qué criterio se usó (criterio de aceptación de la #21) y la #15 lo copia a `criteria.sort`. Al ser genérica, la #15 recibe sus propios ítems ya ordenados, sin volver a unirlos por identificador. El criterio es obligatorio: el valor por defecto (`unit_price`) lo pone la capa HTTP, como dice el contrato. No modifica la entrada: devuelve un arreglo nuevo.
- **Ajuste a la decisión 2:** la regla puede recibir ítems más grandes, pero dentro de ella TypeScript solo deja leer los cinco campos de `RankableOffer`. La neutralidad se mantiene.

### 7. ¿Cómo se prueba que lo comercial no cambia el orden?

- **Decisión:** una prueba de dominio, «una promoción o un perfil comercial no cambian el puesto de una tienda». A la oferta más cara por unidad se le agregan campos comerciales (`promotion`, `verifiedCommerce`, `paidPlacement`), y el orden debe ser idéntico al de las mismas ofertas sin ellos, con los tres criterios.
- **Razón:** las promociones llegan con `commerce` en el corte 3, pero la neutralidad (EC-06) se demuestra desde ahora. Se suma a dos defensas que ya existen: el tipo (decisión 6) y dependency-cruiser (`domain` no importa módulos y el núcleo no conoce a `commerce`). Si alguien cambia el tipo después, la prueba lo detecta.

### 8. ¿Cómo se demuestra el determinismo?

- **Decisión:** cinco ofertas con empates escalonados (mismo precio por unidad; mismo precio y distancia; idénticas salvo el identificador) pasan por `rankOffers` en sus 120 permutaciones, y todas dan exactamente el mismo orden, con cada criterio. Las permutaciones las genera una función pequeña dentro del `.spec.ts`.
- **Razón:** el riesgo real es que el orden dependa de cómo llegan las filas desde la base, que no está garantizado. No se agrega `fast-check` (YAGNI): ningún otro paso lo usa y sus fallos son más difíciles de leer en la evidencia de MC-E3.

## Resultado

La regla vive en `src/domain/neutral-ranking.ts`. El plan de ciclos TDD está en `plan.md`.
