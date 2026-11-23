# ADR-016: Participación de comercios pequeños sin punto de venta

- **Estado:** Aceptado
- **Fecha:** 2026-11-21
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02, EC-05
- **Requisitos relacionados:** en Notion hay 2 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 2 / Evolución / P6 Comercio pequeño
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b811eb33be674bf11c7b8)

Fuente: Notion, base ADRs, página 40239c4a833b811eb33be674bf11c7b8; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Nota de registro

Aceptado el 23-nov-2026 por decisión del dueño del proyecto. La fecha (21 de noviembre de 2026) es la de la evidencia: se aplica desde el módulo `commerce` (21-nov) y la carga por plantilla; la implementación sigue en curso con el equipo comercial. El repositorio no guardaba una fecha de decisión propia; esta es la primera en que la decisión ya estaba aplicada.

## Contexto

Muchas tiendas de barrio no tienen sistema de punto de venta ni tiempo para mantener sus precios al día. Si el portal de comercios exige integraciones o cargas complejas, quedarían por fuera justo los comercios que más se benefician (equidad entre comercios). La guía pregunta cómo participa un comercio pequeño en esas condiciones. Se analiza en el corte 2 junto con el módulo comercial.

## Alternativas consideradas

A) Solo integración por API o con sistemas de punto de venta: excluye a los comercios pequeños.

B) Portal móvil muy simple (actualizar un precio en pocos pasos), plantilla de archivo para cargas por lote, y recordatorios de reconfirmación.

C) Que el equipo cargue los precios en nombre de los comercios: útil para arrancar, pero no escala y genera dependencia.

## Decisión

ACEPTADA el 2026-11-21: B) El portal de comercios es una PWA con una pantalla de actualización rápida (producto, precio, confirmar), carga opcional por plantilla de archivo y recordatorios para reconfirmar precios. Un precio no reconfirmado pasa a "por confirmar" en lugar de borrarse (RF-016). La opción C) se usa solo como acompañamiento inicial, con autorización del comercio y registrando quién cargó el dato.

## Consecuencias

(+) Los comercios sin tecnología pueden participar y se cumple la equidad entre comercios.

(+) La vigencia se mantiene sin obligar al comercio a estar pendiente todo el tiempo.

(−) Mayor volumen de datos de menor calidad; se controla con validación por fila y con el modelo de confiabilidad (ADR-005).

(−) Hay que probar el portal con comerciantes reales; hasta ahora no se ha consultado a comerciantes.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-016](https://app.notion.com/p/40239c4a833b811eb33be674bf11c7b8)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
