# Grill — issue #26: catálogo, propuestas, alias, duplicados e imágenes

- **Fuentes:**
  - Issue #26 (Corte 2, épica #2): búsqueda por nombre, alias o EAN que tolera tildes y mayúsculas; un usuario propone un producto o presentación y queda pendiente; posibles duplicados se sugieren, no se fusionan solos (PR-21); imagen por producto con fuente y atribución (ADR-020).
  - RF-003 (Notion): RN2 el código de barras es único y su dígito de control válido; RN3 una solicitud queda pendiente hasta que un moderador la aprueba o la fusiona con un producto existente; RN4 la búsqueda no distingue mayúsculas ni tildes. Escenarios: solicitud de producto nuevo, código de barras duplicado (se rechaza indicando el producto existente) y dígito de control inválido.
  - ADR-020 (Notion, «Propuesto»): una imagen por producto; orden Open Food Facts por código de barras, foto del equipo, ilustración genérica; los archivos van en un almacenamiento que se decide con ADR-012 (sin decidir).
  - Código existente: búsqueda por texto sin tildes (pg_trgm) y por código de barras (#52); código de barras único y validado (#49, #51); una base de unidad por producto (#59); `POST /v1/product-requests` en el contrato, sin construir; propuestas de tiendas (#27).
- **Ya cumplido:** búsqueda por nombre y código de barras sin tildes ni mayúsculas (#52).
- **Decisión común con la #27:** cada módulo guarda sus propuestas y tiene sus rutas de moderador; aquí, `catalog`.
- **Fecha:** 2026-11-15.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué hacemos con las imágenes?

- **Decisión:** cada producto puede tener `imageUrl`, `imageSource` (`open_food_facts` o `equipo`) e `imageAttribution`, cargados desde la semilla (columnas nuevas de `productos.csv`). Sin imagen, el frontend muestra la ilustración genérica. Subir fotos y el almacenamiento quedan para una issue nueva que espere ADR-012 y la aceptación de ADR-020.
- **Razón:** cumple «imagen con fuente y atribución» sin adelantar decisiones de despliegue que no se han tomado.

### 2. ¿Qué es un alias y quién lo crea?

- **Decisión:** un alias es otro nombre del producto. Llega por la columna `alias` de `productos.csv` (varios separados por `|`) y, cuando el moderador fusiona una propuesta con un producto existente, el nombre propuesto queda como alias. La búsqueda sin tildes ni mayúsculas también mira los alias.
- **Razón:** el moderador enseña al catálogo los nombres que usa la gente, sin duplicar productos.

### 3. ¿Cómo es una propuesta de producto?

- **Decisión:** igual que las tiendas (#27):
  - `POST /v1/product-requests` (reportante): nombre, marca opcional, categoría, presentación (cantidad, unidad y unidades por empaque) y código de barras opcional. Código inválido: 400; código ya en el catálogo: 409 `BARCODE_TAKEN` con el `productId` existente (RN2).
  - `GET /v1/moderation/product-requests` (moderador): las pendientes con sus posibles duplicados.
  - `POST /v1/moderation/product-requests/{requestId}/decision`: `aprobar` (crea el producto y su presentación), `fusionar` con un producto existente (agrega el nombre como alias y, si la presentación es nueva, la agrega a ese producto) o `rechazar`, siempre con motivo.
  - Pendiente, no aparece en búsquedas ni comparaciones (RN3).
- **Razón:** el escenario pide nombre, marca y presentación; reutiliza la forma de la #27.

### 4. ¿Qué es un posible duplicado?

- **Decisión:** hasta 5 productos que devuelve la búsqueda existente con el nombre y la marca propuestos (también por alias). Se sugieren; nunca se fusionan solos (PR-21).
- **Razón:** reutiliza la búsqueda que ya funciona; no hace falta una regla nueva.

## Decisiones menores (sin pregunta)

- Fusionar agrega la presentación solo si no existe una igual (misma cantidad, unidad y unidades por empaque); respeta la regla de una base de unidad por producto (#59): si mezcla bases, responde 422 `MIXED_UNIT_BASES`.
- La propuesta guarda la clave seudónima de quien la hace y, al decidir, la del moderador (EC-08).
- El producto aprobado usa el id de la propuesta; su presentación, un id nuevo.
