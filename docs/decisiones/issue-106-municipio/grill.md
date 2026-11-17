# Grill y plan — issue #106: filtrar la comparación por municipio

- **Relación:** RF-009 (RN5), RF-005, EC-08. Aprobado por el equipo el 15-nov-2026.
- **Rama:** `feat/comparison-municipio` (desde `dev`). Pull request hacia `dev` con `Closes #106`.

## Decisiones

1. **Municipio de cada tienda:** columna `municipality` con una lista cerrada de los 12 municipios del Quindío (`armenia`, `buenavista`, `calarca`, `circasia`, `cordoba`, `filandia`, `genova`, `la-tebaida`, `montenegro`, `pijao`, `quimbaya`, `salento`). Las tiendas de la semilla son de Armenia (salieron de su límite oficial, #51). En una tienda propuesta (#27), el reportante elige el municipio. **Descartado por ahora:** calcularlo con los polígonos municipales en PostGIS (datos externos que hoy no se necesitan).
2. **En la comparación:** parámetro `municipality`. Con municipio, la ubicación es opcional: se puede comparar «en Calarcá» sin compartir dónde está uno (EC-08). Sin ubicación no hay distancia: `distanceM` no sale y `sort=distance` responde 400. Con municipio y ubicación se aplican los dos filtros.
3. **«Tiendas cercanas»:** sin filtro por municipio por ahora (RN5 habla de la comparación).
4. **Dónde se ve:** la tienda gana `municipality` en la comparación, los precios por tienda y la cercanía.
5. **Base:** migración con la columna; las tiendas que ya existen quedan en `armenia`.

## Ciclos TDD

1. **Dominio:** la lista de municipios y su validación.
2. **Persistencia (integración):** la tienda guarda y devuelve su municipio; las tiendas de una lista que están en un municipio, con y sin radio.
3. **Semilla y propuestas:** la semilla marca Armenia; la propuesta guarda el municipio y la aprobación lo copia; uno desconocido responde 400.
4. **Comparación (caso de uso):** filtra por municipio con y sin ubicación; sin ubicación no hay distancia y no se puede ordenar por distancia.
5. **HTTP y contrato:** parámetros, errores 400 y `municipality` en las respuestas.
