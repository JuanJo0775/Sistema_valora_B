# ADR-003: Persistencia: base de datos relacional con soporte geoespacial

- **Estado:** Aceptado
- **Fecha:** 2026-11-03
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-03, EC-04
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 3 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Datos / P4 Equivalencia de productos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b818ab129d6c98834db24)

Fuente: Notion, base ADRs, página 40239c4a833b818ab129d6c98834db24; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- Las consecuencias citan ADR-019 «(10 de noviembre de 2026)», cuando se propuso; ADR-019 se aceptó el 16-nov-2026.

## Contexto

Los datos son relacionales (productos, presentaciones, establecimientos, reportes, usuarios) y la integridad importa mucho (EC-03). Se necesitan consultas por cercanía y búsqueda de texto sin tildes. Los reportes deben conservarse como historial inmutable.

## Alternativas consideradas

A) PostgreSQL con extensión geoespacial (PostGIS) y búsqueda de texto nativa.

B) Base de documentos (por ejemplo MongoDB): flexible, pero se pierden restricciones de integridad y las uniones frecuentes se vuelven costosas.

C) Poliglota desde el inicio (relacional + motor de búsqueda + caché): más potente, pero más piezas que operar.

## Decisión

ACEPTADA POR EL EQUIPO: utilizar PostgreSQL como motor relacional principal y PostGIS para las consultas geoespaciales del directorio de establecimientos. Se conserva la búsqueda de texto inicial en PostgreSQL (unaccent y pg\_trgm, sujetos a validar en implementación). Los reportes de precios se conservan como historial append-only y el precio vigente se obtiene mediante el modelo de lectura definido en ADR-004. No se incorpora un motor de búsqueda adicional ni una base poliglota en el MVP. La versión exacta de PostgreSQL y la configuración operativa se fijarán durante la implementación y el despliegue.

## Consecuencias

(+) Transacciones, restricciones de unicidad y claves foráneas respaldan la integridad.

(+) Un solo motor para datos, geolocalización y búsqueda inicial.

(+) PostGIS alimenta la vista de mapa de establecimientos cercanos; el proveedor del mapa se decide en ADR-019 (10 de noviembre de 2026).

(−) La búsqueda de texto es menos rica que la de un motor dedicado; es suficiente para un catálogo regional.

(−) El crecimiento del historial requiere particionado o archivo a futuro.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-003](https://app.notion.com/p/40239c4a833b818ab129d6c98834db24)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
