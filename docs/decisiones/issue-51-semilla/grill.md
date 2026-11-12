# Grill — issue #51: semilla `pnpm db:seed` idempotente

- **Fuentes:**
  - Issue #51 (parte 3 de #13): `pnpm db:seed` en la base de `DATABASE_URL`, sin duplicar al repetirse, con trazabilidad (RF-014 RN5) y con el dígito de control del código de barras validado con TDD en `domain`.
  - RF-014 (carga manual; RN4: sin extracción automática), RF-003 RN2 (código de barras único y válido) y RF-005.
  - ADR-011 (siembra manual; OpenStreetMap como fuente abierta citada) y ADR-019 (atribución de OSM).
  - Grill común de la #13 (pregunta 4: tiendas de OSM y productos elegidos por el equipo), y grills de la #49 y la #50.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Datos ya preparados (en esta carpeta, sin commit)

- `productos-propuesta.csv`: 31 productos y 37 presentaciones, de las 8 categorías. Es una propuesta de Claude Code con 18 filas por verificar y sin códigos de barras (no se inventan).
- `tiendas-osm.csv`: 211 tiendas de Armenia desde OpenStreetMap (consulta autorizada del 12-nov-2026), con 48 por revisar.
- `como-llenar-productos.md` y `como-revisar-tiendas.md`: guías y criterios.

## Huecos

1. Formato y lugar de los datos de la semilla en el repositorio.
2. Cómo se evita duplicar al repetir la semilla, si las filas no tienen identificador propio.
3. Qué pasa con las filas que aún dicen `verificar = sí` o `revisar = sí`.
4. Qué pasa si una fila cambia o se borra del archivo después de sembrar.
5. Dónde queda la trazabilidad (fuente, responsable y fecha).
6. Qué códigos de barras se aceptan (el contrato admite de 8 a 14 dígitos; la issue habla de EAN-13).

## Preguntas

### 1. Formato y lugar de los datos

- **Opciones:**
  - (a) Los mismos CSV que revisa el equipo (`;`, sin comillas), en `seed/productos.csv` y `seed/tiendas.csv`.
  - (b) Datos escritos en un `seed.ts`.
  - (c) JSON.
- **Recomendación:** (a).
  - Una sola fuente de verdad: lo que se revisa en Excel es lo que se siembra.
  - Cualquier integrante lo actualiza sin programar, y el diff de Git muestra qué fila cambió (evidencia, RF-014 RN5).
  - Sin librería nueva: el formato simple se lee con unas pocas líneas propias, probadas.
- **Decisión:** (a). Los borradores de esta carpeta se mueven a `seed/` (no se copian) cuando se construya la semilla.

### 2. Cómo se evita duplicar al repetir

- **Opciones:**
  - (a) Identificadores fijos (UUID v5, con `node:crypto`) calculados a partir de lo que identifica cada fila: tienda por `osm_id`; producto por nombre y marca; presentación por producto, cantidad, unidad y unidades del empaque. Si el id ya existe, se actualiza la fila.
  - (b) Columnas únicas nuevas (nombre y marca en `products`, `osm_id` en `establishments`).
  - (c) Borrar todo y volver a cargar.
- **Recomendación:** (a).
  - No ensucia las tablas: `osm_id` no tiene sentido para las tiendas que sugiera la comunidad.
  - Seguro a futuro: (c) borraría datos con precios ya reportados.
  - Simple de probar: dos corridas dejan el mismo número de filas.
- **Decisión:** (a). Sin dependencias nuevas.

### 3. Qué filas se cargan

- **Estado de los datos el 11-nov-2026:** tiendas, 158 con `revisar = no` y 26 con `sí` (184 en total, después de una revisión manual que quitó 27); productos, 19 con `verificar = no` y 18 con `sí`, y ninguno con `responsable`.
- **Opciones:**
  - (a) Solo las filas verificadas: tiendas con `revisar = no`; productos con `verificar = no` y `responsable` lleno. Las demás se saltan y la semilla informa cuántas y por qué.
  - (b) Cargar todas, incluidas las pendientes.
- **Recomendación:** (a).
  - RF-014 pide datos con evidencia, no propuestas; un tamaño equivocado daría precios por 100 g equivocados en la comparación.
  - Verificar es llenar columnas en Excel: cada fila se vuelve cargable sin tocar código.
- **Decisión:** (a). Con los datos de hoy se cargarían 158 tiendas y ningún producto. Las pruebas usan sus propios datos, así que la #51 se puede construir sin esperar la verificación.

### 4. Filas que cambian o desaparecen

- **Opciones:**
  - (a) Una fila que cambia actualiza el registro (mismo id fijo); una fila que desaparece del CSV se queda en la base, y la semilla informa cuántas hay así.
  - (b) Sincronizar del todo: lo que no esté en el CSV se borra.
- **Recomendación:** (a).
  - Desde el paso 5 una tienda o un producto puede tener precios; borrarlos perdería historial. Retirar una tienda es tarea de moderación, no de un script.
  - Un CSV guardado a medias (por ejemplo, con un filtro de Excel) no debe borrar datos.
- **Decisión:** (a). Si cambian el nombre o la marca de un producto, el id fijo cambia y entra como producto nuevo; el aviso de filas que ya no están en el CSV lo hace visible. Se anota en la guía.

### 5. Trazabilidad (RF-014 RN5)

- **Opciones:**
  - (a) En los CSV (fuente, responsable y fecha por fila) y en el historial de Git, sin columnas nuevas; el id fijo une cada registro con su fila. Una fila verificada sin fuente o sin fecha se rechaza con un mensaje que nombra la fila.
  - (b) Columnas `source`, `verified_by` y `verified_at` en productos, presentaciones y tiendas.
- **Recomendación:** (a).
  - Las tablas son para todos los registros, no solo los sembrados; las tiendas sugeridas y los productos solicitados tendrán su propio registro de moderación.
  - Un archivo versionado con historial y PR revisado ya es evidencia auditable.
- **Decisión:** (a). La atribución de OpenStreetMap se muestra en el pie del mapa del frontend (ADR-019), no por tienda en la base.

### 6. Códigos de barras aceptados

- **Opciones:**
  - (a) GTIN de 8, 12, 13 y 14 dígitos (EAN-8, UPC-A, EAN-13 y GTIN-14), con su dígito de control (módulo 10, pesos 3 y 1 desde la derecha). Cualquier otro largo se rechaza.
  - (b) Solo EAN-13.
- **Recomendación:** (a).
  - Con solo EAN-13, el escáner fallaría con productos reales que traen EAN-8 o UPC-A.
  - Es el mismo algoritmo y coincide con el contrato (8 a 14 dígitos).
- **Decisión:** (a). Regla pura en `src/domain/`, construida con TDD; también servirá para las solicitudes de producto (RF-003 RN2).

## Resumen

| Tema | Decisión |
|---|---|
| Datos | `seed/productos.csv` y `seed/tiendas.csv` (`;`, sin comillas), los mismos que revisa el equipo |
| Duplicados | Ids fijos UUID v5 a partir de cada fila; si existe, se actualiza |
| Qué se carga | Solo filas verificadas; las demás se saltan y se informan |
| Cambios | Se actualiza, nunca se borra; se informan los registros que ya no están en el CSV |
| Trazabilidad | En los CSV y en Git; una fila verificada sin fuente o fecha se rechaza |
| Códigos de barras | GTIN de 8, 12, 13 y 14 dígitos con dígito de control |
