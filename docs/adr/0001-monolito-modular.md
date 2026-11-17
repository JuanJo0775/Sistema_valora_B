# ADR-001: Estilo arquitectónico: monolito modular

- **Estado:** Aceptado
- **Fecha:** 2026-10-23
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-05, EC-04
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 3 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Estructura / P8 Inmediato vs diferido
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81b38475fb73c96d3c80)

Fuente: Notion, base ADRs, página 40239c4a833b81b38475fb73c96d3c80; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Contexto

El equipo es pequeño y tiene un solo periodo académico con tres cortes. EC-05 exige que el módulo comercial se incorpore sin rediseñar el núcleo, y la guía dice que una arquitectura sencilla y bien justificada es preferible a una que acumula patrones. El RDA2 pide servicios expuestos a los clientes (app del consumidor y portal de comercios), sin importar la granularidad interna.

## Alternativas consideradas

A) Monolito modular: un solo despliegue con módulos por dominio (catálogo, establecimientos, precios, confiabilidad, comercial) y límites explícitos.

B) Microservicios por dominio: independencia de despliegue y escalado, pero mucho costo de operación, pruebas de integración y datos distribuidos para un equipo de este tamaño.

C) Monolito en capas sin límites de módulo: más rápido al inicio, pero el cambio del corte 3 tocaría todo y comprometería EC-05.

## Decisión

ACEPTADA: utilizar un monolito modular como estilo arquitectónico del MVP.

## Consecuencias

(+) Menos complejidad operativa y un despliegue simple (RNF-009).

(+) Las pruebas de extremo a extremo son más fáciles.

(+) Un módulo puede extraerse a servicio más adelante si hace falta.

(−) Se escala todo junto; se mitiga con réplicas y caché (ADR-004).

(−) Requiere disciplina: los límites se verifican con reglas automáticas de dependencias en el análisis estático.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-001](https://app.notion.com/p/40239c4a833b81b38475fb73c96d3c80)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
