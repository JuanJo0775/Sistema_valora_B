# ADR-020: Imágenes de productos y de tiendas

- **Estado:** Aceptado (15-nov-2026; propuesto el 10-nov-2026)
- **Fecha:** 2026-11-15
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-01 (reconocer el producto y registrar rápido), EC-08 (privacidad)
- **Requisitos relacionados:** RF-003, RF-015; ADR-007, ADR-011, ADR-012, ADR-013
- **Pregunta de diseño:** P4 Equivalencia de productos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/414056e503118161b411e8a01e2e782f)

## Contexto

Las imágenes ayudan a reconocer el producto correcto y a registrar más rápido (EC-01). SIPSA no trae imágenes. Las fotos de las páginas de las cadenas tienen derechos de autor y extraerlas va contra sus términos (ADR-011). Una foto tomada con el teléfono puede llevar en sus metadatos (EXIF) la ubicación de quien la tomó (EC-08). El proveedor de despliegue, y con él el almacenamiento de archivos, no está decidido (ADR-012).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Fotos de cada tienda para cada producto | Muy realista | Multiplica imágenes, almacenamiento y moderación |
| B. Una imagen por producto del catálogo: Open Food Facts, foto del equipo o ilustración genérica; el comercio sube su fachada o logo | Una sola imagen por producto; sin riesgo de derechos; nunca falta imagen | Open Food Facts no cubre todo el catálogo colombiano; subir fotos agrega almacenamiento y validación |
| C. Solo ilustraciones genéricas | Sin derechos ni almacenamiento | Menos realista; no ayuda a distinguir presentaciones |

## Decisión

Se elige **B**. La imagen pertenece al producto del catálogo canónico (ADR-007), no a cada tienda.

1. **Orden de prioridad:** Open Food Facts por código de barras, citando la fuente; foto del equipo; ilustración genérica sin marcas (la pone el frontend cuando no hay imagen).
2. **Enlaces (#26):** la semilla puede traer el enlace de la imagen con su fuente (`open_food_facts` o `equipo`) y su atribución.
   - **Precisión del equipo (21-nov-2026):** la fuente `open_food_facts` cubre también sus bases hermanas de la misma fundación, con la misma licencia (CC BY-SA) y el mismo formato: **Open Beauty Facts** (cuidado personal) y **Open Products Facts** (aseo y otros productos que no son comida). En esos casos `imagen_atribucion` nombra la base real (por ejemplo, «Open Products Facts, CC BY-SA») y la PWA la muestra tal cual. No se agregan fuentes nuevas al contrato ni a la base: sería un cambio de esquema por la misma licencia.
3. **Subida en el Corte 2 (#88):** solo el rol moderador sube fotos de producto (fuente `equipo`). El comercio sube la fachada o el logo de su tienda y propone fotos de producto en el Corte 3 (RF-015). El reportante no sube fotos.
4. **Límites:** JPEG, PNG o WebP de hasta 2 MB. El servidor la reduce a 800 px de lado mayor como máximo y la guarda en WebP.
5. **Privacidad:** al reprocesar la imagen se descartan todos los metadatos, incluida la ubicación (EXIF).
6. **Almacenamiento:** detrás de un puerto (`ImageStorage`). Mientras no se decida ADR-012, se guarda en una carpeta del servidor y la API la sirve en solo lectura. El adaptador del proveedor llega con ADR-012 sin cambiar el resto.
7. **Dependencia:** `sharp`, para reducir, convertir a WebP y descartar metadatos.
8. No se copian imágenes de sitios de cadenas.

## Consecuencias

- Positivas: una sola imagen por producto (menos almacenamiento y moderación); sin riesgo de derechos de autor; la ubicación de quien toma la foto nunca se guarda; el proveedor de almacenamiento se puede cambiar sin tocar los casos de uso.
- Negativas / riesgos: `sharp` es una dependencia nativa (binarios por plataforma); la carpeta local no sirve con varias instancias del servidor ni sobrevive a un redespliegue en algunos proveedores (mitigación: adaptador del proveedor con ADR-012); una foto reemplazada deja el archivo anterior guardado.
- Trade-offs aceptados: en el Corte 2 las fotos del equipo dependen de un moderador; Open Food Facts no cubre todo y parte del catálogo mostrará la ilustración.

## Verificación

- Prueba que sube un JPEG con ubicación GPS en sus metadatos y comprueba que el archivo guardado es WebP, de 800 px como máximo y sin metadatos.
- Pruebas HTTP de la subida: solo el moderador, límites de tipo y tamaño, y la imagen en `GET /v1/products/{productId}`.

## Referencias

- Notion: ADR-020 en la base ADRs.
- Issues / PRs: #26 (enlaces), #88 (subida de fotos).
- [Open Food Facts: datos y licencia](https://world.openfoodfacts.org/data)
