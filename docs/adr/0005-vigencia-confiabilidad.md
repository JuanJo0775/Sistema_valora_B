# ADR-005: Modelo de vigencia y confiabilidad: TTL por categoría y score ponderado

- **Estado:** Aceptado
- **Ajustado por:** ADR-024 y ADR-026 (26-nov-2026): el precio oficial sin reconfirmar vale lo mismo que un reporte (7 días frescos y 14 el resto, valores provisionales y configurables en un solo lugar); reconfirmarlo («Todos mis precios siguen igual», editar un precio o subir el archivo) lo renueva.
- **Fecha:** 2026-11-11
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02, EC-03
- **Requisitos relacionados:** en Notion hay 2 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Confiabilidad del dato / P2 Vigencia
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b8141ab1fce0dab5be0e7)

Fuente: Notion, base ADRs, página 40239c4a833b8141ab1fce0dab5be0e7; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Contexto

Las fuentes tienen distinta confiabilidad (usuarios ocasionales, frecuentes y comercios con interés propio) y los precios pierden vigencia: un precio de un producto fresco cambia más rápido que uno envasado. La guía pregunta a partir de qué momento un precio reportado deja de ser confiable. EC-02 y EC-03 piden medidas definidas y justificadas por el equipo.

## Alternativas consideradas

A) TTL único para todos los productos: simple, pero injusto para productos de alta rotación.

B) TTL por categoría más un score ponderado por reputación del reportante, corroboración y antigüedad.

C) Modelo de aprendizaje automático: no hay datos etiquetados al inicio y sus decisiones son difíciles de explicar al usuario.

## Decisión

ACEPTADA (11 de noviembre de 2026): B) TTL por categoría (valores iniciales: 7 días productos frescos, 14 días el resto) con estados vigente, por confirmar (1 a 2 veces el TTL) y desactualizado (más de 2 veces). El score se calcula con una función pura y parametrizable, desarrollada con TDD. Los valores iniciales (7 y 14 días y los pesos del score) siguen siendo PROVISIONALES y parametrizables: se calibran con evidencia específica de actualización de precios en comercios (todavía no existe: no se ha consultado a comerciantes) y con datos de prueba, y la calibración se documenta. Se acepta el modelo, no los valores.

## Consecuencias

(+) El criterio es explicable al consumidor y auditable.

(+) La función pura es muy fácil de probar (RDA3 de Modelos de Calidad).

(−) Los valores iniciales son hipótesis y pueden estar mal calibrados; por eso son configurables.

(−) Requiere definir una lista de categorías con su TTL.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-005](https://app.notion.com/p/40239c4a833b8141ab1fce0dab5be0e7)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
