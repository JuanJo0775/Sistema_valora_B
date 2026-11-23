# ADR-007: Catálogo canónico con presentaciones y unidad base

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-01, EC-06
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 3 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Datos / P4 Equivalencia de productos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b814bae73cfede677f0cb)

Fuente: Notion, base ADRs, página 40239c4a833b814bae73cfede677f0cb; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- **ADR-007: discrepancia de estado.** Resuelto el 23-nov-2026: el estado vigente es Aceptado (Notion, 11-nov-2026).
- El texto de la decisión remite a ADR-020 «(10 de noviembre de 2026)»; la fila de ADR-020 en Notion no tiene fecha y su decisión dice «ACEPTADO (15-nov-2026)».

## Contexto

Un mismo producto aparece con distintos nombres y presentaciones. Sin un criterio común, los precios no son comparables. La guía pregunta cómo se reconoce que dos registros corresponden al mismo producto y cómo se comparan presentaciones distintas.

## Alternativas consideradas

A) Texto libre en cada reporte y agrupación posterior: rápido de registrar, pero la comparación queda poco fiable.

B) Catálogo canónico moderado: producto, presentaciones (cantidad y unidad), código de barras opcional y unidad base para normalizar.

C) Depender únicamente de un catálogo externo: cobertura incierta para productos regionales y dependencia de licencias.

## Decisión

ACEPTADA (11 de noviembre de 2026): B) Catálogo canónico con presentaciones y unidad base (g, ml, unidad). El código de barras se usa como identificador cuando existe. Los duplicados se fusionan por moderación. El cálculo del precio por unidad base vive en un componente de dominio puro, desarrollado con TDD. Se pueden importar productos de fuentes abiertas respetando su licencia. Cada producto canónico tiene una sola imagen; su origen y moderación se definen en ADR-020 (10 de noviembre de 2026).

## Consecuencias

(+) La comparación por unidad de medida es confiable (RF-004, RF-009).

(−) Hay costo de curación del catálogo por parte de moderación.

(−) El registro debe ser muy rápido pese a la búsqueda en el catálogo; se mitiga con búsqueda tolerante, código de barras y productos recientes (EC-01).

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-007](https://app.notion.com/p/40239c4a833b814bae73cfede677f0cb)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
