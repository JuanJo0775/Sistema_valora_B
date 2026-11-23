# ADR-013: Privacidad por diseño: identidad del reportante separada y no pública

- **Estado:** Aceptado
- **Fecha:** 2026-11-15
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-03, EC-08
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Seguridad y privacidad / P3 Reportes maliciosos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81d4b641fc6c1c2e5c7c)

Fuente: Notion, base ADRs, página 40239c4a833b81d4b641fc6c1c2e5c7c; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Nota de registro

Aceptado el 23-nov-2026 por decisión del dueño del proyecto. La fecha (15 de noviembre de 2026) es la de la evidencia: se aplicó con la clave seudónima del reportante (issue #62) y la inspección de privacidad (#36, 15-nov), con las pruebas guardianas `privacy-public-responses` y `privacy-schema`. El repositorio no guardaba una fecha de decisión propia; esta es la primera en que la decisión ya estaba aplicada.

## Contexto

La ubicación y la actividad de los reportantes son datos personales (Ley 1581/2012) y no deben exponerse ni asociarse a su identidad sin autorización. Al mismo tiempo, el sistema necesita identificar a quien reporta para calcular reputación y frenar el abuso (EC-03).

## Alternativas consideradas

A) Mostrar autor y ubicación de cada reporte: transparente, pero expone a las personas.

B) Reportes públicos sin identidad: la identidad y la reputación quedan internas, y la ubicación del dispositivo se usa solo de forma momentánea para sugerir cercanía.

C) Reportes totalmente anónimos y sin cuenta: máxima privacidad, pero sin forma de controlar abusos ni de calcular reputación.

## Decisión

ACEPTADA el 2026-11-15: B) Datos mínimos (correo y alias); identidad en un almacén separado; la API pública nunca devuelve datos de quien reporta; la ubicación del dispositivo no se guarda asociada al reporte; los registros técnicos no contienen datos personales; se definen retención, autorización con versión de la política y procedimiento de consulta y reclamo.

## Consecuencias

(+) Cumple el principio de datos estrictamente necesarios y reduce el impacto de una fuga.

(+) Se mantiene el control de abuso con reputación interna.

(−) Los moderadores acceden a más datos; sus acciones se auditan (RF-002).

(−) Más trabajo de diseño de datos y pruebas de que nada sensible sale por la API.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-013](https://app.notion.com/p/40239c4a833b81d4b641fc6c1c2e5c7c)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
