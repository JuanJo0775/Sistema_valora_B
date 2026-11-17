# Grill — issue #52: búsqueda de productos sin tildes y por código de barras

- **Fuentes:**
  - Issue #52.
  - RF-003 (RN4: la búsqueda no distingue mayúsculas ni tildes; escenario «aceite girasól» encuentra «Aceite de girasol»).
  - ADR-003 (`unaccent` y `pg_trgm` «sujetos a validar en implementación») y ADR-007.
  - `docs/openapi.yaml`: `GET /products` (`q` de 2 caracteres o más, `barcode` de 8 a 14 dígitos, `limit` común y `Cache-Control`).
  - Grill de la #49: producto con marca, categoría y presentaciones; código de barras único.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Comprobado antes del grill

- En PostgreSQL 17, `unaccent` y `pg_trgm` son extensiones «de confianza» (`trusted`): el dueño de la base (`valora`) puede crearlas en una migración, sin el usuario `postgres`. En la CI el usuario también puede.

## Huecos encontrados

1. **Palabras no seguidas.** «aceite girasól» debe encontrar «Aceite de girasol»: las palabras de la búsqueda no aparecen juntas en el nombre.
2. **En qué campos se busca:** solo el nombre, o también la marca y la categoría.
3. **`q` y `barcode`:** el contrato no dice qué pasa si no llega ninguno o si llegan los dos.
4. **Orden de los resultados.**

## Preguntas

### 1. Cómo se compara el texto

- **Opciones:**
  - (a) Cada palabra debe aparecer, en cualquier orden, como palabra completa o como pedazo («gira» encuentra «girasol»), sin distinguir tildes ni mayúsculas; con índice de `pg_trgm`.
  - (b) Búsqueda de texto completo (`tsvector` en español): reduce a la raíz, pero no encuentra pedazos.
- **Recomendación:** (a).
  - Cumple el escenario de RF-003 y funciona mientras el usuario escribe letra por letra.
  - Simple de explicar y de probar.
  - No necesita diccionarios; tolerar errores de escritura se puede agregar después con `pg_trgm`.
- **Decisión:** (a).

### 2. En qué datos se busca

- **Opciones:**
  - (a) Nombre y marca juntos («arroz diana» encuentra «Arroz blanco» de marca Diana).
  - (b) Solo el nombre.
  - (c) Nombre, marca y categoría.
- **Recomendación:** (a).
  - La gente busca con la marca que ve en el empaque, y la marca se guarda aparte del nombre (grill de la #49).
  - La categoría se elige, no se escribe; filtrar por categoría sería un parámetro aparte, con su propia issue.
- **Decisión:** (a).

### 3. `q` y `barcode`

- **Opciones:**
  - (a) Exactamente uno: sin ninguno, 400 «Envía q o barcode»; con los dos, 400 «Envía solo q o barcode, no ambos». Con `barcode` se responde el único producto que tiene esa presentación, o la lista vacía.
  - (b) Permitir ambos y combinarlos.
- **Recomendación:** (a).
  - Son dos formas distintas de buscar (escribir o escanear), y el código ya identifica un producto exacto.
  - Sin ninguno, la búsqueda devolvería todo el catálogo, que es otra funcionalidad.
- **Decisión:** (a). Un código sin producto responde la lista vacía, no 404, para que la PWA ofrezca «Solicita el producto» (RF-003).

### 4. Orden de los resultados

- **Opciones:**
  - (a) Por parecido con lo escrito (`similarity` de `pg_trgm` sobre nombre y marca) y, en empate, por nombre.
  - (b) Alfabético.
- **Recomendación:** (a). Pone primero lo que más probablemente se busca, que importa en un celular con pocos resultados visibles; `pg_trgm` ya está en uso.
- **Decisión:** (a).
- **Caché:** `Cache-Control: public, max-age=30`, el valor de ejemplo del contrato, más corto que los 5 minutos del producto para que un producto nuevo aparezca pronto (valor inicial calibrable). La URL lleva el texto buscado, no la ubicación, así que no hay problema de privacidad.

## Resumen

| Tema | Decisión |
|---|---|
| Comparación | Cada palabra debe aparecer, en cualquier orden y también como pedazo, sin tildes ni mayúsculas |
| Campos | Nombre y marca |
| `q` y `barcode` | Exactamente uno; si no, 400. Un código sin producto responde la lista vacía |
| Orden | Por parecido y, en empate, por nombre |
| Caché | `public, max-age=30` |
| Extensiones | `unaccent` y `pg_trgm`, creadas por migración (son «de confianza» en PostgreSQL 17) |
