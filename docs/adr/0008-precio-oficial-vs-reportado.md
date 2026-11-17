# ADR-008: Resolución entre precio oficial y precio reportado

- **Estado:** Propuesto
- **Fecha:** PENDIENTE (equipo): la propiedad «Fecha de decisión» está vacía en Notion
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02, EC-03, EC-05
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 2 / Confiabilidad del dato / P1 Oficial vs reportado, P3 Reportes maliciosos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81a49acad075e17414ee)

Fuente: Notion, base ADRs, página 40239c4a833b81a49acad075e17414ee; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- `docs/diagramas/README.md` es el único lugar del repo que menciona ADR-008; `docs/DECISIONS.md` no tiene entrada.

## Contexto

Cuando un comercio publica un precio oficial y los usuarios reportan otro, hay que decidir cuál se muestra y cómo se explica. Un comercio puede equivocarse o desactualizarse, y un competidor puede reportar precios falsos para perjudicarlo. La regla debe ser igual para todos los comercios (equidad). Se introduce con el módulo comercial en el corte 2 y se construye en el corte 3.

## Alternativas consideradas

A) Siempre prevalece el precio oficial: protege al comercio, pero oculta una desactualización real.

B) Siempre prevalece lo reportado por la comunidad: abre la puerta a ataques de competidores.

C) Mostrar siempre ambos valores: transparente, pero genera ruido cuando coinciden.

D) Regla determinista: el oficial es la referencia y solo una discrepancia corroborada por varios reportes independientes y confiables se muestra con ambos valores y aviso.

## Decisión

PROPUESTA: D) Se muestra el precio oficial con su fuente. La diferencia se mide respecto al oficial; hasta el umbral inclusive (propuesto 5 %) se considera coincidencia. Si la diferencia supera el umbral y al menos 2 reportes independientes, recientes y de confiabilidad media o alta la sostienen, se muestran ambos valores con aviso de discrepancia, fuente y fecha. El comercio recibe una notificación para responder o corregir. Los umbrales son configurables.

## Consecuencias

(+) Protege al comercio de reportes aislados y al consumidor de precios desactualizados.

(+) La regla es objetiva, igual para todos y comprobable con pruebas.

(−) La interfaz debe explicar la discrepancia sin confundir; se prueba con usuarios.

(−) Depende de la calidad del cálculo de confiabilidad (ADR-005).

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-008](https://app.notion.com/p/40239c4a833b81a49acad075e17414ee)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
