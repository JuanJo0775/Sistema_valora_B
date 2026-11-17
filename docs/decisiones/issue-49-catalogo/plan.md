# Plan — issue #49: catalog, productos y presentaciones

- **Objetivo:** primer módulo de negocio (`catalog`), creado con `/nuevo-modulo`, con sus tablas y `GET /v1/products/{productId}`.
- **Relación:** issue padre #13, épica #2, RF-003, RF-004, ADR-007 (aceptado), ADR-021, ADR-005 (categoría fresca), EC-04, EC-05.
- **Fuera de alcance:**
  - Búsqueda (#52).
  - Dígito de control EAN-13 y semilla (#51).
  - Solicitudes de producto, alias y fusión de duplicados.

## Dependencias

Ninguna nueva.

## Rama y pull request

`feat/catalog-productos`, que sale de `dev`. Un pull request hacia `dev` con `Closes #49`.

## Diseño (`src/modules/catalog/`)

- **`index.ts`:** solo exporta `CatalogModule`. Ningún otro módulo usa el catálogo todavía.
- **`catalog.module.ts`:** registrado en `AppModule`.
- **`application/`:**
  - `product-repository.ts`: puerto con un solo método, `findById(id)`.
  - `get-product.ts`: caso de uso. Devuelve el producto o lanza `ProductNotFoundError`.
  - Vista del producto: `ProductView` (id, nombre, marca, categoría `{ code, name }` y presentaciones).
- **`infrastructure/`:**
  - `schema.ts` con `pgSchema('catalog')` y tres tablas:
    - `categories`: `code` (clave, texto), `name` e `is_fresh`.
    - `products`: `id` (uuid), `name`, `brand` (opcional) y `category_code` (referencia a `categories`).
    - `presentations`: `id` (uuid), `product_id` (referencia a `products`), `quantity` (numeric > 0), `unit` (`g`, `kg`, `ml`, `l` o `und`, con `CHECK`), `pack_count` (entero ≥ 1, 1 por defecto) y `barcode` (opcional y **único**).
  - `drizzle-product-repository.ts`: implementación real con Drizzle.
- **`http/`:**
  - `products.controller.ts`: `GET /products/:productId` con `ParseUUIDPipe` (400 si no es UUID) y la cabecera `Cache-Control: public, max-age=300`.
  - `product.response.ts`: DTO de salida explícito.
  - `ProductNotFoundError` se traduce a 404 `NOT_FOUND`.
- **Migraciones:**
  - `0002_catalog`: generada con `pnpm db:generate`. Crea el esquema y las tablas.
  - `0003_catalog-categories`: escrita a mano con `drizzle-kit generate --custom`. Inserta las 8 categorías iniciales:

| `code` | `name` | `is_fresh` |
|---|---|---|
| `fruits-vegetables` | Frutas y verduras | sí |
| `meat-fish` | Carnes y pescados | sí |
| `dairy-eggs` | Lácteos y huevos | sí |
| `bakery` | Panadería | sí |
| `grains-groceries` | Granos y abarrotes | no |
| `beverages` | Bebidas | no |
| `household-cleaning` | Aseo del hogar | no |
| `personal-care` | Cuidado personal | no |

- **Cantidad decimal:** `numeric` en PostgreSQL llega como texto; el repositorio la convierte a número para la respuesta. `domain` ya la lee como fracción exacta cuando calcula el precio por unidad (#11).
- **Reglas de dependencia:** las de la #42 ya permiten `drizzle-orm` en `src/modules/*/infrastructure/`, y la regla «solo por `index.ts`» ya aplica. No hacen falta reglas nuevas.

## Ciclos TDD

Cada ciclo es un commit `test(catalog)` (rojo) y otro `feat(catalog)` (verde), más un `refactor` si hace falta.

**Caso de uso, con un repositorio en memoria como doble:**

1. Un producto existente se devuelve con su categoría y sus presentaciones.
2. Un producto inexistente lanza `ProductNotFoundError`.

**Repositorio real, por integración contra `valora_test`:**

3. Un producto guardado se lee con su categoría `{ code, name }` y sus presentaciones (unidad, cantidad, `packCount` y código de barras).
4. Las 8 categorías iniciales existen después de migrar, con su marca de fresca.
5. La base rechaza dos presentaciones con el mismo código de barras.

**HTTP, por integración con Supertest:**

6. `GET /v1/products/{id}` responde 200 con la forma del contrato y `Cache-Control: public, max-age=300`.
7. Un id inexistente responde 404 `NOT_FOUND`, y un id que no es UUID responde 400 `VALIDATION_ERROR`.
8. Una segunda petición con `If-None-Match` igual al `ETag` responde 304.

Las pruebas de integración vacían las tablas de productos y presentaciones antes de cada prueba (no las categorías, que son datos de referencia de la migración).

## Después

- `docs/openapi.yaml` según `contrato-api.md`.
- **Documentación:**
  - `docs/ARCHITECTURE.md`: la fila de `catalog` (ya existe) se revisa.
  - `DECISIONS.md`: categorías como lista cerrada en tabla, presentación tal como se escribe y caché de 5 minutos.
  - Esta carpeta de decisiones.
- **Issue #51:** agregar el criterio «el dígito de control EAN-13 se valida con TDD en `domain`».

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- Los criterios de #49 cubiertos por pruebas (ciclos 6 y 7).

## Notion

- **[EPIC-B02]:** la fila de la #49 pasa a «PR abierto…» y luego a «Terminado…».
