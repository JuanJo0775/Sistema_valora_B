# Plan — issue #52: búsqueda de productos sin tildes y por código de barras

- **Objetivo:** `GET /v1/products?q=…|barcode=…` en el módulo `catalog`, según las 4 decisiones del grill.
- **Relación:** épica #2, RF-003 (RN4), ADR-003, ADR-007, EC-04.
- **Fuera de alcance:**
  - Filtro por categoría.
  - Tolerar errores de escritura.
  - Solicitudes de producto.

## Dependencias

Ninguna nueva en Node. En PostgreSQL, las extensiones `unaccent` y `pg_trgm`, que vienen con PostgreSQL 17 y son «de confianza».

## Rama y pull request

`feat/catalog-busqueda`, que sale de `dev`. Un pull request hacia `dev` con `Closes #52`.

## Diseño

- **Migración `0006_catalog-search`**, escrita a mano con `drizzle-kit generate --custom`:
  - `CREATE EXTENSION IF NOT EXISTS unaccent` y `pg_trgm`.
  - Función `catalog.search_text(name, brand)`: une nombre y marca, quita tildes y pasa a minúsculas. Se declara `IMMUTABLE` para poder indexarla, con el diccionario de `unaccent` fijo.
  - Índice GIN con `gin_trgm_ops` sobre `catalog.search_text(name, brand)` en `catalog.products`.
- **`application/`:**
  - El puerto `ProductRepository` agrega `search({ text, limit })` y `findByBarcode(barcode)`. Los dos devuelven `ProductView[]`.
  - Caso de uso `SearchProducts`: recibe `q` o `barcode`, uno solo, y llama al método que corresponde.
- **`infrastructure/` (`DrizzleProductRepository`):**
  - **`search`:**
    - Parte el texto en palabras. Cada palabra pasa por la misma función de normalización y se compara con `LIKE '%palabra%'`, todas con `AND`.
    - Los comodines `%`, `_` y `\` que escriba el usuario se **escapan**, para que «100%» no coincida con todo.
    - Ordena por `similarity` y luego por nombre, con `limit`.
  - **`findByBarcode`:** busca el producto que tiene esa presentación.
  - Las presentaciones de varios productos se leen con **una sola consulta** (`product_id IN …`).
  - La conversión de filas a `ProductView`, que hoy está en `findById`, se reutiliza en los tres métodos (refactorización con las pruebas en verde).
- **`http/`:**
  - `ProductsController` agrega `GET /products`.
  - DTO de entrada: `q` con 2 caracteres o más, `barcode` de 8 a 14 dígitos y `limit`.
  - La regla «exactamente uno» responde 400 con los mensajes del grill.
  - `Cache-Control: public, max-age=30`.
  - La salida reutiliza `toProductResponse`.

## Ciclos TDD

Cada ciclo es un commit `test(catalog)` (rojo) y otro `feat(catalog)` (verde), más un `refactor` cuando aplique. Las pruebas crean sus propios productos de prueba, por ejemplo «Aceite de girasol», «Arroz blanco» de marca «Diana» y «Galletas con leche».

**Repositorio (integración con `valora_test`):**

1. «aceite girasól» encuentra «Aceite de girasol»: tildes, mayúsculas y palabras no seguidas (escenario de RF-003).
2. Un pedazo de palabra encuentra el producto («gira»), una palabra de la marca también («arroz diana»), y un producto que no tiene todas las palabras no aparece.
3. Ordena por parecido («leche» pone «Leche entera» antes que «Galletas con leche»), desempata por nombre y respeta el límite.
4. Un comodín escrito por el usuario («100%») no coincide con todos los productos.
5. Por código de barras, encuentra el producto de esa presentación; un código sin producto devuelve la lista vacía.

**HTTP (Supertest):**

6. `GET /v1/products?q=…` responde 200 con la forma del contrato y `Cache-Control: public, max-age=30`.
7. Responde 400 `VALIDATION_ERROR` sin `q` ni `barcode`, con los dos, con `q` de 1 carácter y con un `barcode` con letras.
8. `GET /v1/products?barcode=…` responde 200 con el producto, o con la lista vacía.

## Después

- `docs/openapi.yaml` según `contrato-api.md`.
- `DECISIONS.md`: búsqueda, extensiones y caché de 30 segundos.
- README: la búsqueda en «Estado» y la migración nueva.
- Esta carpeta de decisiones.

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- Los criterios de #52 cubiertos por pruebas: «aceite girasól» (ciclo 1) y el código de barras (ciclos 5 y 8).

## Notion

- **[EPIC-B02]:** la fila 4d (#52) pasa a «PR abierto…» y luego a «Terminado…».
