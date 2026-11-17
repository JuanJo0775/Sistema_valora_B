# ADR-018: Backend: NestJS sobre Express

- **Estado:** Aceptado
- **Fecha:** 2026-11-08
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-04, EC-05, EC-08
- **Requisitos relacionados:** en Notion hay 0 relaciones con RF y 0 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Estructura / P8 Inmediato vs diferido
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40d39c4a833b818fa69deb7b39138d16)

Fuente: Notion, base ADRs, página 40d39c4a833b818fa69deb7b39138d16; estado copiado de Notion.

> El texto de las secciones Contexto a Consecuencias está copiado de las propiedades de texto de la fila; el cuerpo de la página de Notion se copia al final, tal cual (con sus títulos bajados un nivel). Los saltos `<br />` de las propiedades se muestran como párrafos.

## Contexto

El backend debe implementar un monolito modular en TypeScript, exponer REST/OpenAPI 3.x bajo /v1, gestionar sesiones seguras y RBAC en servidor, aplicar validación y pruebas automatizadas, y mantener límites explícitos entre módulos. El framework HTTP debe aportar la menor complejidad compatible con esas necesidades.

## Alternativas consideradas

A) Express independiente: framework minimalista basado en rutas y middleware. Da control y tiene un ecosistema amplio, pero el equipo debe definir convenciones propias para módulos, inyección de dependencias, validación, autorización, errores, OpenAPI y pruebas. B) NestJS usando su adaptador Express: framework TypeScript con módulos, providers e inyección de dependencias, guards y pipes; utiliza Express por defecto y ofrece estructura guiada para un monolito modular. Añade abstracciones y curva de aprendizaje. C) NestJS con Fastify: alternativa si una medición demuestra que el adaptador HTTP es un cuello de botella; implica comprobar compatibilidad de middleware y plugins.

## Decisión

ACEPTADA (8 de noviembre de 2026): el backend se construye con NestJS usando su adaptador por defecto, Express. Las reglas de negocio del módulo domain se escriben en TypeScript puro, sin decoradores ni dependencias de NestJS. Se descarta Express independiente porque obligaría al equipo a construir y mantener a mano los límites de módulo, la inyección de dependencias, la autorización por rol, la validación, la documentación OpenAPI y los eventos internos, que NestJS ya trae integrados y alineados con el monolito modular (ADR-001). Fastify no se adopta: solo se reconsidera si la prueba de carga de EC-04 muestra un cuello de botella atribuible al servidor HTTP. La validación práctica se hace con el esqueleto de extremo a extremo (H2-01).

## Consecuencias

(+) Los módulos de NestJS materializan los límites del monolito modular: cada módulo declara qué expone, lo que protege EC-05. (+) Guards y decoradores centralizan el control de acceso por rol en el servidor (ADR-014, EC-08). (+) ValidationPipe y DTOs validan las entradas del reporte sin código repetido (RNF-014). (+) @nestjs/swagger genera la documentación OpenAPI desde el código, que se contrasta con docs/openapi.yaml (ADR-002). (+) @nestjs/event-emitter da el bus de eventos interno (ADR-015). (+) Jest e inyección de dependencias facilitan el TDD y las pruebas de integración (MC-E3). (+) Al correr sobre Express se conserva su ecosistema de middleware. (−) Curva de aprendizaje mayor: decoradores, providers e inyección de dependencias. Mitigación: plantilla del esqueleto (H2-01) y una guía corta en el repositorio. (−) Más abstracción y algo más de consumo de memoria que Express puro; se mide en la prueba de carga (EC-04). (−) Riesgo de acoplar las reglas de negocio al framework. Mitigación: domain en TypeScript puro, verificado con dependency-cruiser en CI. (−) Riesgo de que el contrato generado y docs/openapi.yaml diverjan. Mitigación: comparación automática en CI.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-018](https://app.notion.com/p/40d39c4a833b818fa69deb7b39138d16)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente

## Cuerpo de la página de Notion (copiado tal cual)

<callout icon="🟢" color="green_bg">
<b>Estado: ACEPTADO.</b><br />El backend de Valora utiliza NestJS sobre Express. Express es el adaptador HTTP de NestJS; no se adopta Express como framework independiente.
</callout>

### Decisión adoptada

Usar NestJS con el adaptador Express para implementar la API REST /v1 del monolito modular. NestJS organiza módulos, controladores, proveedores y dependencias; Express funciona como plataforma HTTP subyacente.

### Alcance de la decisión

- API REST con contrato OpenAPI, conforme a ADR-002.
- Organización por módulos alineada con las fronteras del monolito modular de ADR-001.
- Integración con PostgreSQL + PostGIS, sesiones, autorización por roles y pruebas automatizadas.
- El frontend React + TypeScript + Vite con vite-plugin-pwa consume esta API; no se acopla al framework backend.

### Alternativa descartada

Express independiente se descarta como opción principal para este proyecto. NestJS aporta una estructura modular y mecanismos consistentes de inyección de dependencias, validación y pruebas, sin dejar de usar Express como adaptador HTTP.

### Consecuencias y validación

La decisión está aceptada, pero no significa que el backend esté implementado. Su validación técnica se realizará con el esqueleto de extremo a extremo y las pruebas de API, sesiones/RBAC, OpenAPI, persistencia y TDD previstas para los cortes 2 y 3. No declarar cumplimiento sin evidencia ejecutada.

### Referencias relacionadas

- <mention url="https://app.notion.com/p/40d39c4a833b80ffa47cfb7c2d06254e">Arquitectura y stack tecnológico</mention>
- <mention url="https://app.notion.com/p/40d39c4a833b81aab6ebe8c4cf246552">Frontend PWA: React + Vite con vite-plugin-pwa</mention>
- <mention url="https://app.notion.com/p/40239c4a833b819a81dec248e8ca5d6d" />
