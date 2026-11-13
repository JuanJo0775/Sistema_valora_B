# Plan — issue #15: `GET /v1/products/{productId}/comparison`

- **Objetivo:** comparar, sin cuenta, los precios vigentes de un producto en las tiendas cercanas, con precio total, precio por unidad, fuente, fecha y vigencia, en un orden declarado y neutral.
- **Relación:** paso 6 del H2-01, épica #6. RF-008, RF-009, RF-010, ADR-004, ADR-005, ADR-009, EC-04, EC-06 y EC-08. Usa `rankOffers` de la #21.
- **Decisiones:** `grill.md` (9 preguntas). Cambios del contrato: `contrato-api.md`.
- **Fuera de alcance:**
  - `reliability` y `confirmations` (#31).
  - Promociones reales y precios oficiales (corte 3).
  - Que el catálogo rechace bases de unidad mezcladas (#59).
  - Historial de precios (`/history`).

## Dependencias

Ninguna nueva.

## Rama y pull request

`feat/comparison-consultar-producto`, ya al día con `dev`. Un pull request hacia `dev` con `Closes #15`. El primer commit sube el grill, el contrato y este plan.

## Diseño

### `catalog` (soporte)

- **`application/product-for-comparison.ts`:** clase pública `ProductForComparison` con `find(productId)`. Devuelve `{ id, isFresh, presentations: [{ id, quantity, unit, packCount }] }` o `null`.
- Nuevo método `findForComparison` en `ProductRepository`, implementado en `DrizzleProductRepository`.
- Se exporta en `index.ts` y en `exports` del módulo NestJS (mismo patrón que `PresentationExists`).

### `establishments` (soporte)

- **`application/establishments-within-radius.ts`:** clase pública `EstablishmentsWithinRadius` con `find({ ids, lat, lng, radiusMeters })`. Devuelve solo las tiendas de la lista que están dentro del radio, con la forma de `NearbyEstablishment` (incluye `distanceM`, redondeada al metro).
- Nuevo método `findWithinRadius` en `EstablishmentRepository`: el mismo SQL de `findNearby`, con `id = any(ids)` y sin `limit`. Con la lista vacía no consulta la base.
- Se exporta igual que `EstablishmentExists`.

### `comparison` (núcleo)

- **`application/compare-product.ts`**, caso de uso `CompareProduct`, con cuatro puertos:
  - `ProductLookup`: lo cumple `ProductForComparison`;
  - `StoresWithinRadius`: lo cumple `EstablishmentsWithinRadius`;
  - `CurrentPrices`: lee `price_current` por presentaciones;
  - `Clock`.
- **Pasos del caso de uso:**
  1. Busca el producto; si no existe, devuelve `null` (el controlador responde 404).
  2. Lee los precios vigentes de sus presentaciones.
  3. Pide las tiendas de esos precios que están dentro del radio y descarta los demás precios.
  4. Calcula el precio por unidad (`calculateUnitPrice`) y la vigencia (`freshnessOf`, con TTL de 7 días si la categoría es fresca y 14 si no; constante única en `comparison`, provisional según ADR-005).
  5. Separa los grupos: vigentes y por confirmar; desactualizados al final. Con `onlyCurrent`, solo vigentes.
  6. Ordena cada grupo con `rankOffers` y marca `isCheapest`.
  7. Devuelve `criteria`, `results` y `promotions: []`. `source` siempre es `comunidad`.
- **`infrastructure/drizzle-current-prices.ts`:** lee `comparison.price_current` por `presentation_id`.
- **`http/`:**
  - `ProductsComparisonController` con `GET /products/:productId/comparison` y `Cache-Control: no-store`.
  - DTO de consulta con `class-validator`: `lat`, `lng`, `radiusKm` (0,5 a 3, 2 por defecto), `sort` (`unit_price` por defecto) y `onlyCurrent` (`false` por defecto).
  - `productId` validado como UUID (400).
  - DTO de respuesta explícito, con `unitPrice.valueCop` como `displayCop`.
  - Un `null` del caso de uso responde 404 `NOT_FOUND`.
- **`comparison.module.ts`:** importa `CatalogModule` y `EstablishmentsModule` y arma el caso de uso con fábricas, como `PricingModule`.

### Reglas de dependencia

Sin reglas nuevas: `comparison` (núcleo) puede usar el `index.ts` de los módulos de soporte, y estos no conocen al núcleo. `pnpm depcheck` lo confirma.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y otro `feat(...)` (verde), más un `refactor` solo si hay una refactorización real.

**Soporte (integración con `valora_test`):**

1. `ProductForComparison` devuelve las presentaciones y si la categoría es fresca, o `null` si el producto no existe.
2. `EstablishmentsWithinRadius` devuelve solo las tiendas pedidas que están dentro del radio, con su distancia.

**Caso de uso `CompareProduct` (dobles detrás de los puertos):**

3. Un producto que no existe no tiene comparación (`null`).
4. Un producto sin precios devuelve `results` vacío, `promotions` vacío y el criterio declarado (`sort` y `radiusKm`).
5. Un precio se muestra con su tienda, precio total, precio por unidad, fuente `comunidad`, fecha y vigencia.
6. Un precio de una tienda fuera del radio no aparece.
7. La vigencia usa el TTL de la categoría: 10 días después, un producto fresco está por confirmar y uno no fresco sigue vigente.
8. Los desactualizados van al final, ordenados entre sí con el mismo criterio.
9. Con `onlyCurrent`, solo quedan los vigentes.
10. `isCheapest` marca el precio más bajo por unidad entre vigentes y por confirmar, y todos los empatados; nunca un desactualizado.
11. El orden sigue el criterio pedido (`distance` pone primero la tienda más cercana).

**`comparison` (integración):**

12. `CurrentPrices` lee de `price_current` solo las presentaciones pedidas.

**HTTP (Supertest):**

13. 200 con la forma del contrato y `Cache-Control: no-store`.
14. 400 con `productId` que no es UUID, sin `lat`, con `radiusKm` 5 y con `sort` desconocido.
15. 404 con un producto que no existe.
16. **Privacidad (EC-08):** la ubicación no aparece en la respuesta ni en el log, y la consulta no escribe ninguna fila.
17. **De punta a punta:** `POST /v1/reports`, luego `OutboxRelay.runOnce()`, y `GET …/comparison` muestra ese precio.

Si una prueba pasa sin código nuevo, se sube como caracterización y su commit lo dice, como en la #21.

## Después

- `docs/openapi.yaml` según `contrato-api.md`.
- **`docs/DECISIONS.md`:** sección de la #15 (radio y caché iguales a `/nearby`, `reliability` desde la #31, desactualizados al final, `isCheapest`, sin promedios, `source` fijo).
- **README:** fila de la #15 en «Estado» y «Siguiente».
- **Notion:** EPIC-B06 con el avance de la #15.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde, con `src/domain` al 80 % o más de líneas.
