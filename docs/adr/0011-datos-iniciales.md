# ADR-011: Datos iniciales: referencia pública y siembra manual

- **Estado:** Aceptado
- **Fecha:** 2026-10-30
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02
- **Requisitos relacionados:** en Notion hay 2 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Datos / P5 Datos iniciales
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81cd9caac5adf5849150)

Fuente: Notion, base ADRs, página 40239c4a833b81cd9caac5adf5849150; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Contexto

Antes de que exista una comunidad de reportantes la plataforma estaría vacía y no tendría valor. La guía sugiere fuentes públicas como el SIPSA del DANE, que reporta precios del sector agropecuario (mayoristas y plazas), no de tiendas. Hay restricciones legales sobre el uso de datos de terceros.

## Alternativas consideradas

A) Esperar a la comunidad: el arranque queda sin datos y sin motivo para participar.

B) Importar fuentes públicas como precios de referencia y sembrar manualmente un grupo acotado de establecimientos y productos del Quindío con apoyo del equipo.

C) Extraer datos de los sitios de cadenas y supermercados: da cobertura, pero depende de sus términos de uso y puede ser ilegal o frágil.

## Decisión

APROBADA PARA EL MVP: realizar manualmente la carga inicial del catálogo y la siembra acotada de datos de establecimientos/precios con evidencia. SIPSA se conserva como fuente pública de referencia para apoyar validación y comparación cuando existan datos realmente comparables; sus datos no se presentan como precios de una tienda. No se implementará una integración automática completa con SIPSA en el MVP ni extracción automatizada de sitios de terceros.

## Consecuencias

(+) La plataforma puede iniciar con un conjunto acotado de datos incorporados manualmente y con trazabilidad. (+) SIPSA sirve como referencia cuando su cobertura y unidad sean comparables. (+) Se evita comprometer una integración automática completa y se reduce el riesgo de depender de fuentes que no cubren la canasta o tienen restricciones de uso. (−) La cobertura inicial depende del trabajo manual del equipo. (−) La disponibilidad y comparabilidad de datos SIPSA deben comprobarse antes de usarlos como referencia. La meta de arranque y las evidencias se mantienen solo en la medida en que sean viables y estén documentadas.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-011](https://app.notion.com/p/40239c4a833b81cd9caac5adf5849150)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
