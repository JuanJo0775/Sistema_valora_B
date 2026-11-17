# ADR-009: Neutralidad: promociones separadas del orden de la comparación

- **Estado:** Propuesto
- **Fecha:** PENDIENTE (equipo): la propiedad «Fecha de decisión» está vacía en Notion
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-06
- **Requisitos relacionados:** en Notion hay 3 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / API y comunicación / P7 Neutralidad
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b816ea704c7defb9eee3b)

Fuente: Notion, base ADRs, página 40239c4a833b816ea704c7defb9eee3b; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- `docs/DECISIONS.md` aplica ADR-009 (issue #21, orden neutral) sin listarlo en la tabla de Aprobadas; Notion: Propuesto. PENDIENTE (equipo) confirmar el estado.

## Contexto

Los comercios tienen interés en destacar sus promociones. EC-06 exige que el orden responda solo a criterios declarados y que todo contenido promocional se distinga del resultado en el 100 % de los casos. La neutralidad es además una obligación ética de la guía. Aunque la funcionalidad se construye en el corte 3, el diseño del contrato de la API debe preverlo desde el corte 1.

## Alternativas consideradas

A) Mezclar promociones en el resultado con una etiqueta: es fácil que el orden termine dependiendo de ellas.

B) Separar en el contrato y en la interfaz: la función de orden solo recibe criterios declarados, y las promociones van en una colección aparte.

C) No mostrar promociones: elimina el riesgo pero incumple el alcance del módulo comercial.

## Decisión

PROPUESTA: B) La función de ordenamiento es pura y solo recibe precio, precio por unidad base, distancia y actualidad. La respuesta de la API trae los resultados y, en un campo distinto, las promociones. La interfaz las presenta en un bloque etiquetado. Se prueba por propiedad que el orden no cambia con ni sin promociones.

## Consecuencias

(+) EC-06 se puede comprobar de forma automática.

(+) El orden es reproducible y explicable.

(−) Los comercios tienen menos visibilidad que en un modelo publicitario; es una decisión ética consciente.

(−) La API devuelve dos colecciones, lo que complica un poco a los clientes.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-009](https://app.notion.com/p/40239c4a833b816ea704c7defb9eee3b)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
