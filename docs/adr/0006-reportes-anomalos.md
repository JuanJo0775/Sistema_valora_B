# ADR-006: Detección de reportes anómalos: reglas estadísticas y revisión humana

- **Estado:** Aceptado
- **Fecha:** 2026-11-14
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-03
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Confiabilidad del dato / P3 Reportes maliciosos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81bba61def64ff01c955)

Fuente: Notion, base ADRs, página 40239c4a833b81bba61def64ff01c955; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Nota de registro

Aceptado el 23-nov-2026 por decisión del dueño del proyecto. La fecha (14 de noviembre de 2026) es la de la evidencia: se aplicó en la issue #20 (precios anómalos, 14-nov) y se midió en la issue #67; ADR-030 se apoya en él. El repositorio no guardaba una fecha de decisión propia; esta es la primera en que la decisión ya estaba aplicada.

## Contexto

Un usuario, o un grupo coordinado (incluso un competidor), puede registrar precios falsos (EC-03). El sistema debe detectarlos y tratarlos sin borrar información. La guía pide que el equipo defina la tasa de detección esperada sobre un conjunto de prueba.

## Alternativas consideradas

A) Solo moderación manual: no escala y deja pasar datos falsos mientras se revisa.

B) Reglas automáticas (distancia a la mediana de la zona, límites de frecuencia, detección de cuentas nuevas coordinadas) con cola de moderación humana.

C) Modelo de aprendizaje automático: sin datos etiquetados al inicio y con riesgo de sesgo no explicable.

## Decisión

ACEPTADA el 2026-11-14: B) Reglas estadísticas simples y parametrizables, límites de frecuencia por cuenta y dispositivo, y cola de moderación. La detección cambia el estado del reporte a "en revisión" y no elimina nada. Se construye un conjunto de prueba sintético con casos anómalos para medir detección y falsos positivos. Se revisa un modelo de aprendizaje solo si hay datos suficientes en el corte 3.

## Consecuencias

(+) Resultados explicables y medibles (RNF-003).

(+) El historial se conserva.

(−) Un atacante que conoce las reglas puede evadirlas; se complementa con reputación y corroboración (ADR-005).

(−) Los falsos positivos recargan al moderador; se mide y se ajusta el umbral.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-006](https://app.notion.com/p/40239c4a833b81bba61def64ff01c955)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
