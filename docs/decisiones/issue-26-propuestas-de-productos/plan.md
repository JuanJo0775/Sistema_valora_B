# Plan — issue #26: catálogo, propuestas, alias, duplicados e imágenes

- **Rama:** `feat/catalog-propuestas` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #26`.
- **Relación:** Corte 2, épica #2. RF-003 (RN2, RN3, RN4), RF-004, PR-21, ADR-020 (propuesto), EC-08.
- **Decisiones:** `grill.md` (4 preguntas). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna. **Migraciones:** `0019_catalog-proposals` (alias e imagen) y `0020_catalog-product-requests` (propuestas).
- **Fuera de alcance:** subir fotos y su almacenamiento (issue nueva, depende de ADR-012 y ADR-020).

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Alias e imágenes:**

1. **Persistencia (integración):** un producto guarda sus alias y su imagen; la búsqueda lo encuentra por un alias sin tildes ni mayúsculas; el producto sale con su imagen.
2. **Semilla:** las columnas `alias`, `imagen_url`, `imagen_fuente` e `imagen_atribucion` de `productos.csv` llegan al catálogo; una fuente desconocida o una URL inválida nombran la fila.

**Propuestas:**

3. **Persistencia (integración):** una propuesta queda pendiente y no aparece en la búsqueda; aprobarla crea el producto y su presentación; fusionarla agrega el alias y, si es nueva, la presentación; rechazarla no crea nada.
4. **`RequestProduct`:** guarda la propuesta pendiente con la clave de quien la hace; un código ya usado se rechaza indicando el producto (409); una categoría desconocida se rechaza.
5. **`ProductRequestsQueue`:** las pendientes con hasta 5 posibles duplicados de la búsqueda, sin datos de quien propuso.
6. **`DecideProductRequest`:** aprobar, fusionar (exige un producto existente y respeta la base de unidad de la #59) o rechazar, siempre con motivo; una decidida no se encuentra.

**HTTP:**

7. `POST /v1/product-requests`: 202, 400, 401, 403, 409.
8. Lista y decisión del moderador: 200, 204, 400, 403, 404, 422; el producto aprobado aparece en la búsqueda y el pendiente no; la imagen sale en `GET /v1/products/{productId}`.
9. La matriz de autorización, el guardián y la privacidad incluyen las rutas nuevas.

## Otras tareas

- **Documentos:** `openapi.yaml`, `seed/README.md`, matriz, README y `DECISIONS.md`.
- **Issue nueva:** subir fotos de productos (ADR-020, ADR-012).
- **Notion:** EPIC-B02 y RF-003.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
