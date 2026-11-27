# ADR-008: Resolución entre precio oficial y precio reportado

- **Estado:** Aceptado
- **Completado por:** ADR-024 (26-nov-2026): dónde vive la regla (dominio puro), quién la aplica (`comparison`, al leer), qué valor entra al orden con discrepancia (la mediana de los reportes que corroboran) y qué pasa al reconfirmar.
- **Fecha:** 2026-11-21
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02, EC-03, EC-05
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 2 / Confiabilidad del dato / P1 Oficial vs reportado, P3 Reportes maliciosos
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81a49acad075e17414ee)

Fuente: Notion, base ADRs, página 40239c4a833b81a49acad075e17414ee; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Nota de registro

Aceptado el 23-nov-2026 por decisión del dueño del proyecto. La fecha (21 de noviembre de 2026) es la de la evidencia: se aplicó con el módulo comercial (21-nov): sin reportes que lo contradigan entra el precio oficial. El repositorio no guardaba una fecha de decisión propia; esta es la primera en que la decisión ya estaba aplicada.

## Contexto

Cuando un comercio publica un precio oficial y los usuarios reportan otro, hay que decidir cuál se muestra y cómo se explica. Un comercio puede equivocarse o desactualizarse, y un competidor puede reportar precios falsos para perjudicarlo. La regla debe ser igual para todos los comercios (equidad). Se introduce con el módulo comercial en el corte 2 y se construye en el corte 3.

## Alternativas consideradas

A) Siempre prevalece el precio oficial: protege al comercio, pero oculta una desactualización real.

B) Siempre prevalece lo reportado por la comunidad: abre la puerta a ataques de competidores.

C) Mostrar siempre ambos valores: transparente, pero genera ruido cuando coinciden.

D) Regla determinista: el oficial es la referencia y solo una discrepancia corroborada por varios reportes independientes y confiables se muestra con ambos valores y aviso.

## Decisión

ACEPTADA el 2026-11-21: D) Se muestra el precio oficial con su fuente. La diferencia se mide respecto al oficial; hasta el umbral inclusive (propuesto 5 %) se considera coincidencia. Si la diferencia supera el umbral y al menos 2 reportes independientes, recientes y de confiabilidad media o alta la sostienen, se muestran ambos valores con aviso de discrepancia, fuente y fecha. El comercio recibe una notificación para responder o corregir. Los umbrales son configurables.

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
