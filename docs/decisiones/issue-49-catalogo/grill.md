# Grill — issue #49: catalog, productos y presentaciones

- **Fuentes:**
  - Issue #49 (parte 1 de #13).
  - Grill común en `docs/decisiones/issue-13-catalogo-y-establecimientos/grill.md`.
  - RF-003 y RF-004 (con RN6 y RN7 del 11-nov-2026).
  - ADR-007 (aceptado) y ADR-021.
  - `docs/openapi.yaml`: `GET /products/{productId}` y los esquemas `Product`, `Presentation` y `BaseUnit`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. Cómo se guarda una presentación

- **Huecos del contrato:** `Presentation` solo admite `g`, `ml` y `und`, y no tiene número de unidades del empaque. RF-004 RN4 y RN6 piden empaques (6 × 330 ml) y las unidades `kg` y `l`.
- **Opciones:**
  - (a) Guardarla como se escribe (`quantity`, `unit` entre `g`, `kg`, `ml`, `l` y `und`, y `packCount`, que vale 1 por defecto); la conversión la hace la regla de `domain`.
  - (b) Guardarla solo en unidad base (1 kg → 1000 g).
- **Recomendación:** (a).
  - El usuario ve lo que dice el empaque («Arroz 1 kg», «Gaseosa 6 × 330 ml»).
  - La conversión vive en un solo lugar (`src/domain/unit-price.ts`, #11).
  - Un six-pack y una botella del mismo total no se confunden.
- **Decisión:** (a). El contrato cambia en el PR de #49: `unit` con los 5 valores y el campo nuevo `packCount`.

### 2. Marca del producto

- **Hueco:** `Product` no tiene marca, pero RF-003 («Solicitud de producto nuevo») registra «nombre, marca y presentación».
- **Opciones:**
  - (a) Campo `brand` opcional.
  - (b) La marca dentro del nombre.
- **Recomendación:** (a).
  - RF-003 la nombra.
  - El catálogo canónico (ADR-007) distingue productos por marca, y un campo propio permite mostrarla y detectar duplicados.
  - Es opcional para frescos y a granel.
- **Decisión:** (a). `Product` agrega `brand` opcional en el contrato.

### 3. Categoría del producto

- **Hueco:** `Product.category` es texto libre en el contrato. ADR-005 fija el TTL por categoría (7 días frescos, 14 el resto), así que la categoría no puede escribirse de cualquier forma.
- **Opciones:**
  - (a) Texto libre opcional.
  - (b) Lista cerrada de categorías.
- **Decisión:** (b), propuesta de la integrante que dirige el backend. Con texto libre, «Lácteos», «lacteos» y «Leche» serían categorías distintas y la vigencia no podría calcularse por categoría.

### 4. Dónde vive la lista de categorías

- **Opciones:**
  - (a) Tabla `catalog.categories` (identificador, nombre visible y si es fresca), cargada por migración; cada producto apunta a una categoría.
  - (b) Lista fija en el código (`enum` en TypeScript y en el contrato).
- **Recomendación:** (a).
  - La lista es un dato del negocio, no del código.
  - Existe igual en `valora_dev`, `valora_test` y la CI, sin depender de la semilla (#51).
  - Guarda «fresca o no» junto a cada categoría, que es lo que ADR-005 necesita para el TTL.
  - Agregar una categoría es una migración nueva, revisada en un PR.
- **Decisión:** (a). El contenido de la lista lo decide el equipo.
- **Lista inicial** (borrador basado en la canasta básica, aprobado por la integrante que dirige el backend el 11-nov-2026; el equipo puede ajustarla con una migración nueva):

| Categoría | ¿Fresca? (TTL de 7 días, ADR-005) |
|---|---|
| Frutas y verduras | Sí |
| Carnes y pescados | Sí |
| Lácteos y huevos | Sí |
| Panadería | Sí |
| Granos y abarrotes | No |
| Bebidas | No |
| Aseo del hogar | No |
| Cuidado personal | No |

### 5. Cómo aparece la categoría en la respuesta

- **Opciones:**
  - (a) Objeto `{ code, name }`, por ejemplo `{ "code": "dairy-eggs", "name": "Lácteos y huevos" }`.
  - (b) Solo el nombre.
- **Recomendación:** (a). El código no cambia aunque se corrija el nombre, y sirve para filtrar o elegir un ícono en el frontend.
- **Decisión:** (a). Si la categoría es fresca no se expone: solo lo usa el servidor para la vigencia.

### 6. Reglas del código de barras (RF-003 RN2)

- **Opciones:**
  - (a) En #49, `barcode` opcional con índice único en la tabla de presentaciones; la regla del dígito de control (EAN-13) se construye con TDD en `domain` en #51, que es lo primero que crea productos.
  - (b) Las dos reglas en #49.
- **Recomendación:** (a). La unicidad es parte de definir la tabla; la validación es una regla de negocio que nace con quien la usa (YAGNI).
- **Decisión:** (a). Se agrega a #51 como criterio de aceptación.

### 7. Caché de `GET /products/{productId}`

- **Hueco:** la regla `api-rest.md` pide `Cache-Control` y `ETag` en las lecturas públicas (EC-04), pero el contrato solo los pone en `GET /products`.
- **Opciones:**
  - (a) `Cache-Control: public, max-age=300` y `ETag` (Express ya genera el `ETag` y el 304).
  - (b) Sin caché hasta la prueba de carga.
- **Recomendación:** (a). Cumple la regla, cuesta una cabecera y su prueba, y el catálogo cambia poco.
- **Decisión:** (a). Los 300 segundos son un valor inicial calibrable con la prueba de carga de EC-04.
- **Errores:** un `productId` que no es UUID responde 400 `VALIDATION_ERROR`; un UUID sin producto responde 404 `NOT_FOUND`.

## Resumen

| Tema | Decisión |
|---|---|
| Presentación | Como se escribe: `quantity`, `unit` (`g`, `kg`, `ml`, `l`, `und`) y `packCount` (1 por defecto) |
| Marca | `brand` opcional |
| Categoría | Lista cerrada en `catalog.categories`, cargada por migración, con 8 categorías iniciales; cada una sabe si es fresca |
| Categoría en la respuesta | `{ code, name }`; «fresca» no se expone |
| Código de barras | Único desde #49; el dígito de control EAN-13 se valida en #51 |
| Caché | `Cache-Control: public, max-age=300` y `ETag` |
