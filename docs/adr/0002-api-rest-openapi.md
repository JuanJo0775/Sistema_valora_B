# ADR-002: Estilo de API: REST con OpenAPI y dos superficies

- **Estado:** Aceptado
- **Fecha:** 2026-10-23
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-01, EC-04, EC-07
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / API y comunicación / P8 Inmediato vs diferido
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b8197a703d87ea6ee2506)

Fuente: Notion, base ADRs, página 40239c4a833b8197a703d87ea6ee2506; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Contexto

El sistema expone dos superficies cliente con permisos distintos: la aplicación web del consumidor/reportante y el portal de comercios. Las operaciones del dominio están identificadas y son relativamente acotadas: consulta y comparación de precios, consulta de productos y establecimientos, envío de reportes y operaciones del portal. Las consultas de comparación son más frecuentes que los registros y deben poder aprovechar mecanismos HTTP de caché para contribuir al escenario EC-04. El envío de reportes debe admitir reintentos sin duplicar registros (RF-007), mediante una clave de idempotencia y control del lado servidor. TypeScript está aprobado como lenguaje principal, pero el contrato de API también debe poder documentarse, probarse y entenderse sin depender de que el consumidor comparta el código fuente o el sistema de tipos interno del backend. La guía académica exige un contrato preliminar de API documentado.

## Alternativas consideradas

A) REST sobre HTTPS con JSON y OpenAPI 3.x: operaciones explícitas mediante recursos, rutas y métodos HTTP. OpenAPI ofrece un contrato declarativo, legible por personas y máquinas, independiente del lenguaje; permite documentar operaciones, generar clientes y apoyar pruebas. Aprovecha semántica HTTP y caché de consultas GET. B) GraphQL: esquema tipado y consultas donde cada cliente selecciona los campos y relaciones que necesita; reduce solicitudes múltiples cuando las pantallas requieren combinaciones variables de datos. Para el dominio actual, las operaciones están acotadas y conocidas, por lo que la flexibilidad adicional no compensa introducir esquema, resolvers y controles específicos de profundidad, complejidad y autorización por campo. La caché HTTP compartida requiere una estrategia más deliberada que en recursos REST. C) tRPC: ofrece inferencia de tipos de extremo a extremo entre cliente y servidor TypeScript, reduce duplicación de tipos y permite batching; es atractivo en aplicaciones full-stack TypeScript con frontend y backend acoplados. Sin embargo, su principal ventaja depende de compartir el entorno TypeScript y el tipo del router del servidor. La generación oficial de OpenAPI de tRPC se encuentra en fase alfa y presenta limitaciones declaradas, por lo que no se toma como base del contrato estable exigido para este proyecto. D) gRPC: eficiente y tipado para comunicación entre servicios, pero añade complejidad y no aporta una ventaja necesaria para los clientes web del MVP. E) WebSockets: adecuados para comunicación bidireccional persistente y actualizaciones en tiempo real; el MVP no tiene un requisito de tiempo real estricto y las alertas son opcionales, por lo que no justifican mantener conexiones persistentes.

## Decisión

ACEPTADA: utilizar una API REST sobre HTTPS, con JSON y contrato documentado mediante OpenAPI 3.x, versionada bajo /v1. Se expondrán dos superficies lógicas: API del consumidor/reportante y API del portal de comercios, con autorización diferenciada por operación y rol. Las consultas de lectura utilizarán métodos HTTP apropiados y políticas de caché (por ejemplo, Cache-Control y ETag cuando corresponda). El envío de reportes aceptará una clave de idempotencia generada por el cliente y validada/registrada por el servidor para evitar duplicados ante reintentos. OpenAPI será el contrato verificable de endpoints, parámetros, cuerpos, respuestas, errores y requisitos de seguridad; deberá mantenerse alineado con la implementación y utilizarse para documentación y pruebas. No se adopta GraphQL ni tRPC para el MVP.

## Consecuencias

(+) Contrato HTTP estándar, explícito y desacoplado del lenguaje; puede ser consumido por clientes TypeScript u otros lenguajes sin importar tipos internos del backend. (+) OpenAPI proporciona una descripción legible por personas y máquinas, facilita documentación, generación de clientes y automatización de pruebas. (+) La semántica HTTP permite aplicar caché de lectura y políticas de revalidación, contribuyendo al EC-04. (+) La idempotencia de los reportes permite reintentos controlados sin duplicación, si se implementa y prueba en servidor. (+) Las dos superficies pueden aplicar permisos diferenciados sin duplicar el dominio. (−) Algunas pantallas pueden requerir varias solicitudes; se resolverá con endpoints de lectura agregada cuando exista una necesidad demostrada, sin convertir la API en consultas arbitrarias. (−) Se debe mantener el documento OpenAPI sincronizado con la implementación, versionar cambios incompatibles y ejecutar pruebas de contrato. (−) Se renuncia a la selección libre de campos de GraphQL y a la inferencia automática end-to-end de tRPC; estas ventajas no compensan la complejidad o dependencia adicional en el alcance actual. La decisión no afirma que las pruebas o el contrato OpenAPI ya estén implementados: son artefactos pendientes de elaboración y verificación.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-002](https://app.notion.com/p/40239c4a833b8197a703d87ea6ee2506)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
