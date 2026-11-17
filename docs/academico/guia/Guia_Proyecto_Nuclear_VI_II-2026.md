Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 1 de 15

## 1. Identificación del proyecto

| Programa académico | Ingeniería de Software |
| --- | --- |
| Seminario nuclear | 4 |
| Periodo académico | VI (II-2026) |
|   | Diseño, evolución y evaluación de la calidad de una plataforma |
| Título general del proyecto | colaborativa de comparación de precios entre tiendas y |
|   | supermercados |
| Asignaturas que participan del | Nombre del docente Correo electrónico |
| proyecto |   |
| Arquitectura de Software II | Rubén Darío Díaz Bautista |
| Modelos de Calidad | Rubén Darío Díaz Bautista |

## 2. Eje problémico del proyecto del seminario nuclear

El costo de la canasta familiar es una de las preocupaciones más persistentes de los hogares colombianos. Un mismo producto puede tener precios muy distintos según el establecimiento, el barrio, la presentación o la semana y, sin embargo, el consumidor rara vez cuenta con información suficiente para comparar antes de comprar. La información de precios está dispersa: las grandes cadenas la publican en sus propios catálogos y canales digitales, muchas tiendas de barrio no la publican en ningún medio, y las promociones cambian con frecuencia y con condiciones que no siempre son claras.

Esta asimetría de información afecta a dos actores. Por un lado, los hogares, en especial aquellos para quienes una diferencia de precio pesa más en el presupuesto, toman decisiones de compra sin datos o invierten tiempo recorriendo establecimientos. Por otro, las tiendas de barrio y los comercios pequeños, que en muchos casos ofrecen precios competitivos, carecen de un canal para hacerlo visible frente a la capacidad publicitaria de las grandes superficies.

El proyecto propone una plataforma colaborativa en la que los propios usuarios registran los precios que encuentran en tiendas y supermercados, y en la que cualquier persona puede consultar y comparar el precio de un producto entre establecimientos. Los comercios que lo deseen pueden crear un perfil y publicar sus precios oficiales y sus promociones. El valor de la plataforma depende de un problema técnico de fondo: la información proviene de fuentes con distinta confiabilidad (usuarios ocasionales, usuarios frecuentes y comercios con interés propio) y, aun así, debe presentarse de manera confiable, actualizada y neutral.

Este seminario nuclear, desarrollado en el marco de la Corporación Universitaria Empresarial Alexander von Humboldt, busca que los estudiantes enfrenten el problema como lo haría un


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

equipo profesional: identificando los requisitos que determinan la arquitectura, tomando decisiones de diseño con información incompleta, documentándolas y verificando con evidencia si el producto resultante cumple los atributos de calidad que se propuso. Delimitación del alcance: la plataforma es informativa. Permite registrar, consultar y comparar precios, y que los comercios publiquen información y promociones. Quedan fuera del alcance la venta en línea, los pagos, los pedidos y los domicilios. El proyecto tampoco pretende constituir un sistema oficial de precios ni sustituir la labor de vigilancia de las autoridades de protección al

consumidor.

- 3. Eje problémico en el cual giran las asignaturas

La plataforma constituye un escenario integrador en el que las dos asignaturas abordan el mismo producto desde perspectivas complementarias: Arquitectura de Software II se ocupa de las decisiones estructurales que permiten al sistema cumplir sus atributos de calidad, y Modelos de Calidad se ocupa de definir, medir y verificar esos atributos. Ninguna de las dos prescribe la solución; ambas ofrecen a los estudiantes el marco conceptual para construirla y justificarla.

Versión:

Fecha:

Página 2 de 15

## Arquitectura de Software II

La asignatura aporta los fundamentos para que cada equipo proponga, documente y evalúe la arquitectura de la plataforma. El producto tiene características que hacen que esas decisiones no sean triviales: las consultas de comparación son mucho más frecuentes que los registros de precios; los datos llegan de fuentes con distinta confiabilidad y pierden vigencia con el tiempo; los comercios participan de manera voluntaria y con intereses propios; y el alcance crece de un corte a otro, lo que pone a prueba la capacidad de la arquitectura para evolucionar. Los contenidos del microcurrículo, entre ellos los estilos arquitectónicos (monolítico, basado en componentes, orientado a servicios), los patrones (CQRS, Event Sourcing, Saga, Strangler Fig, Backend for Frontend, Circuit Breaker), los paradigmas de comunicación (REST, GraphQL, gRPC, WebSockets), los modelos de servicio en la nube, los enfoques cloud native, Domain-Driven Design y las técnicas de documentación y evaluación de arquitecturas, constituyen un repertorio de alternativas. No se espera que el proyecto los incorpore todos. Cada equipo seleccionará los que respondan a los escenarios de calidad de su producto y justificará tanto lo que incorpora como lo que descarta. Una arquitectura sencilla y bien justificada es preferible a una que acumula patrones sin necesidad.

## Modelos de Calidad

La asignatura aporta el marco para que la calidad sea un objetivo explícito y verificable desde el inicio del proyecto, y no una revisión al final. Los equipos distinguirán la calidad del producto de la calidad del proceso con el que lo construyen; seleccionarán y priorizarán, a partir del modelo ISO/IEC 25010:2023, las características y subcaracterísticas que son críticas para su plataforma, pues no todas lo son en la misma medida; definirán métricas y umbrales de aceptación, y evaluarán el producto siguiendo el marco de evaluación de ISO/IEC 25040.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

El carácter colaborativo de la plataforma hace que la calidad de los datos sea tan importante como la del software: un comparador con precios desactualizados, duplicados o falsos pierde su razón de ser aunque el código funcione correctamente. Por ello el modelo de calidad de datos ISO/IEC 25012 tiene un papel central en el proyecto. Además, las reglas de negocio del dominio, como la normalización de precios por unidad de medida, la vigencia de un precio o las condiciones de una promoción, ofrecen un terreno adecuado para aplicar Test-Driven Development.

La convergencia de ambas asignaturas se hace visible en un mismo artefacto: los escenarios de calidad. Modelos de Calidad los especifica y los mide; Arquitectura de Software II diseña para satisfacerlos y evalúa si lo logra.

Versión:

Fecha:

Página 3 de 15

## 4. Descripción del proyecto nuclear

El proyecto consiste en diseñar, construir de manera incremental y evaluar una plataforma colaborativa de comparación de precios de productos de consumo masivo entre tiendas de barrio, minimercados y supermercados, con foco inicial en Armenia y el departamento del Quindío.

## 4.1 Actores

| Actor | Descripción | Necesidades principales |
| --- | --- | --- |
|   | Persona que consulta precios para | Encontrar rápidamente dónde es más |
| Consumidor | decidir dónde comprar. Puede usar la | económico un producto, con información |
|   | plataforma con o sin cuenta. | en la que pueda confiar. |
|   | Consumidor registrado que aporta los | Registrar un precio en pocos segundos, |
| Reportante | precios que observa en los | desde el establecimiento y con |
|   | establecimientos. | conectividad móvil limitada; saber que |
|   |   | su aporte es útil. |
|   | Tienda, minimercado o supermercado | Publicar precios oficiales y promociones, |
| Comercio | que decide crear un perfil. Su | hacerse visible y corregir información |
|   | participación es voluntaria. | errónea sobre su negocio. |
|   |   | Atender reportes de información |
| Moderador | Rol administrativo de la plataforma. | dudosa, gestionar cuentas y preservar la |
|   |   | integridad de la comparación. |


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 4 de 15

## 4.2 Alcance funcional y evolución por cortes

El producto se construye en dos incrementos. El segundo se introduce deliberadamente como un cambio de alcance sobre un núcleo ya diseñado y construido, con el fin de que los equipos evalúen con evidencia la capacidad de su arquitectura para evolucionar.

| Incremento | Funcionalidades | Diseño y construcción |
| --- | --- | --- |
|   | Catálogo de productos que permita reconocer un |   |
|   | mismo producto en distintas presentaciones y |   |
|   | denominaciones. |   |
| Núcleo: | Registro colaborativo de precios por | Se diseña en el corte 1 y |
| comparación | establecimiento. | se construye en el corte |
| colaborativa de | Directorio de establecimientos con ubicación. | 2. |
| precios |   |   |
|   | Consulta y comparación del precio de un producto |   |
|   | entre establecimientos, incluida la comparación |   |
|   | por unidad de medida. |   |
|   | Perfil voluntario de comercio. |   |
|   | Publicación de precios oficiales. |   |
|   | Publicación de promociones con reglas (descuento |   |
| Módulo comercial: | porcentual, precio especial, pague X lleve Y, | Se introduce y analiza en |
| vigencia). perfiles y |   | el corte 2; se construye e |
| promociones | Integración de la información oficial con la | integra en el corte 3. |
|   | reportada por los usuarios. |   |
|   | Opcional, a decisión del equipo: alertas de bajada |   |
|   | de precio para productos que sigue un |   |
|   | consumidor. |   |

## 4.3 Fuera del alcance

Venta en línea, carrito de compras, pagos, pedidos y domicilios; recomendaciones basadas en perfilamiento de los usuarios; y cualquier funcionalidad que implique que la plataforma actúe como intermediaria comercial.

## 4.4 Preguntas de diseño abiertas

La guía no define la solución. Las siguientes preguntas no tienen una única respuesta correcta; cada equipo deberá resolverlas, registrar su decisión y sostenerla con argumentos y evidencia.

- 1. Cuando un comercio publica un precio oficial y los usuarios reportan uno distinto, ¿cuál se muestra y cómo se le comunica al consumidor?

- 2. ¿A partir de qué momento un precio reportado deja de ser confiable?

- 3. ¿Cómo se detectan y se tratan los reportes erróneos o malintencionados, incluidos los que podría hacer un competidor?


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 5 de 15

- 4. ¿Cómo se reconoce que dos registros corresponden al mismo producto, y cómo se comparan presentaciones distintas?

- 5. ¿De dónde provienen los primeros datos, antes de que exista una comunidad de reportantes? Puede considerarse, por ejemplo, el uso de fuentes públicas como el Sistema de Información de Precios del Sector Agropecuario (SIPSA) del DANE.

- 6. ¿Cómo participa un comercio pequeño que no cuenta con sistema de punto de venta ni con tiempo para mantener sus precios actualizados?

- 7. ¿Cómo se garantiza que las promociones no alteren la neutralidad de la comparación?

- 8. ¿Qué partes del sistema deben responder de inmediato y cuáles pueden actualizarse con cierto retraso?

## 4.5 Escenarios de calidad de referencia

Los siguientes escenarios, expresados en el formato estímulo, entorno, respuesta y medida propuesto por Bass, Clements y Kazman, son el punto de partida de los requisitos de calidad del proyecto. Describen lo que el sistema debe lograr, no cómo lograrlo. Cada equipo debe refinarlos, priorizarlos, ajustar las medidas cuando lo justifique y agregar los que su análisis identifique.

| ID | Atributo | Escenario | Medida de respuesta |
| --- | --- | --- | --- |
|   |   | Un reportante que está frente a la | El registro se completa en 15 |
|   | Capacidad de | góndola de un establecimiento, con | segundos o menos en al |
| EC-01 | interacción (ISO/IEC | conectividad móvil limitada, registra | menos el 80 % de los intentos |
|   | 25010) | el precio de un producto. | durante una prueba con |
|   |   |   | usuarios. |
|   |   |   | La comparación deja de |
|   | Actualidad del dato | Un comercio con perfil modifica el | presentar el precio anterior |
| EC-02 | (ISO/IEC 25012) | precio de un producto durante la | como vigente dentro de un |
|   |   | operación normal. | plazo máximo que el equipo |
|   |   |   | define y justifica. |
|   |   |   | Los datos no confiables no se |
|   | Credibilidad del dato | Un usuario, o un grupo coordinado, | presentan como vigentes sin |
| EC-03 | (ISO/IEC 25012) e | registra precios falsos de un | advertencia. El equipo define |
|   | integridad (ISO/IEC | establecimiento. | la tasa de detección esperada |
|   | 25010) |   | sobre un conjunto de prueba |
|   |   |   | de reportes anómalos. |
|   | Eficiencia de | En un fin de semana de quincena, | El percentil 95 del tiempo de |
| EC-04 | desempeño | 500 usuarios concurrentes | respuesta de la consulta es |
|   | (ISO/IEC 25010) | consultan comparaciones de | de 2 segundos o menos. |
|   |   | precios. |   |


Código:

## GUÍA PARA LA ELABORACIÓN DEL PROYECTO DEL SEMINARIO NUCLEAR

Versión:

Fecha:

Página 6 de 15

| ID | Atributo | Escenario | Medida de respuesta |
| --- | --- | --- | --- |
|   |   |   | Se registran los componentes |
|   | Mantenibilidad: | Se incorpora el módulo comercial | modificados y el esfuerzo real |
| EC-05 | modificabilidad | sobre el núcleo construido en el | frente al estimado; el núcleo |
|   | (ISO/IEC 25010) | corte 2. | no requiere rediseño |
|   |   |   | estructural. |
|   |   |   | El orden de la comparación |
|   | Corrección funcional |   | responde únicamente a los |
|   | (ISO/IEC 25010), |   | criterios declarados al |
| EC-06 | neutralidad de la | Un comercio publica una promoción. | usuario, y todo contenido |
|   | comparación |   | promocional se distingue del |
|   |   |   | resultado de la comparación |
|   |   |   | en el 100 % de los casos. |

Las medidas son valores de partida. Un equipo puede modificarlas si su análisis lo justifica, y ese análisis también se evalúa.

## 5. Justificación del proyecto del seminario nuclear

Desde la perspectiva social, una plataforma que haga visibles las diferencias de precio entre establecimientos contribuye a que los hogares tomen decisiones de compra informadas. El beneficio es mayor para los hogares con ingresos limitados, para quienes la diferencia entre un establecimiento y otro representa una parte significativa del presupuesto mensual.

Desde la perspectiva económica, la plataforma ofrece a las tiendas de barrio y a los comercios pequeños un canal para dar a conocer precios y promociones sin depender de grandes inversiones publicitarias, y favorece una competencia basada en información y no solo en capacidad de difusión. Al mismo tiempo, el comercio local conserva el control sobre la información de su negocio.

Desde la perspectiva académica, el proyecto reproduce condiciones de la práctica profesional que rara vez aparecen en los ejercicios de aula: datos imperfectos, requisitos que cambian, actores con intereses en conflicto y decisiones que deben tomarse sin certeza. En lugar de un enunciado que indica qué patrones o tecnologías usar, los estudiantes deben identificar los requisitos que determinan la arquitectura, comparar alternativas y responder por sus decisiones, lo que corresponde directamente a los resultados de aprendizaje de Arquitectura de Software II orientados a proponer y evaluar arquitecturas. De igual forma, en Modelos de Calidad deben decidir qué calidad importa para su producto y demostrarla mediante medición, en lugar de aplicar un modelo de manera exhaustiva y genérica.

Desde la perspectiva institucional, el proyecto fortalece la proyección social de la universidad al abordar un problema cotidiano de la comunidad de la región, y abre la posibilidad de socializar los resultados con consumidores y comerciantes locales.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 7 de 15

## 6. Objetivo general del proyecto

Diseñar, evolucionar y evaluar la arquitectura de software de una plataforma colaborativa de comparación de precios entre tiendas y supermercados, a partir de decisiones arquitectónicas propuestas, justificadas y documentadas por los estudiantes, y verificar su calidad mediante modelos y estándares de calidad del producto y de los datos, durante el periodo académico

II-2026.

## 7. Resultados de aprendizaje por asignatura académica

## Arquitectura de Software II

- RDA1: propone estilos, patrones arquitectónicos de acuerdo con las necesidades del proyecto.

- RDA2: implementa arquitecturas orientadas a servicios de forma apropiada siguiendo buenas prácticas en el diseño e implementación de las mismas.

- RDA3: reconoce los principios de los enfoques Cloud y utiliza herramientas de orquestación de contenedores según las necesidades del proyecto.

- RDA4: aplica técnicas de evaluación de arquitecturas para identificar riesgos, trade-offs y puntos de mejora en sistemas software.

En este proyecto, el RDA2 se aborda a través del diseño e implementación de los servicios que la plataforma expone a sus clientes (aplicación del consumidor, portal de comercios), independientemente de la granularidad interna que el equipo elija.

## Modelos de Calidad

- RDA1: reconoce los fundamentos de la calidad del software diferenciando calidad de producto y proceso, gestión de la calidad y garantía de calidad.

- RDA2: comprende las aplicaciones y diferencias de los modelos de calidad de software y su evolución en el tiempo.

- RDA3: identifica los fundamentos de TDD o Test-Driven Development e implementa estrategias y principios de esta metodología.

## 8. Metodología

El proyecto se desarrolla mediante un enfoque iterativo e incremental, organizado alrededor de las decisiones de diseño. El principio que orienta la metodología es el siguiente: el docente plantea el problema, los actores, las restricciones y los escenarios de calidad de referencia; los equipos toman las decisiones de diseño y responden por ellas con argumentos y evidencia. La metodología se organiza en cinco fases alineadas con los cortes académicos.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 8 de 15

## Fase 1: Comprensión del problema y requisitos significativos (corte 1)

- 1. Análisis de actores y del contexto: entrevistas breves o encuestas a consumidores y comerciantes, incluida al menos una tienda de barrio, para validar necesidades y restricciones.

- 2. Benchmarking: revisión de soluciones existentes de comparación de precios, nacionales o internacionales, identificando cómo resuelven, o no, la confiabilidad de la información.

- 3. Requisitos y escenarios de calidad: especificación de los requisitos funcionales del núcleo, refinamiento y priorización de los escenarios de calidad, e identificación de restricciones.

## Fase 2: Diseño de la arquitectura del núcleo (corte 1)

- 1. Alternativas candidatas: formulación de al menos dos alternativas arquitectónicas plausibles para el núcleo y su comparación frente a los escenarios priorizados.

- 2. Arquitectura seleccionada: documentación con el modelo C4 (contexto y contenedores como mínimo, y componentes para las partes críticas) y registro de las decisiones en ADRs, incluidas las alternativas descartadas y sus razones.

- 3. Plan de calidad: selección del modelo de calidad, características priorizadas, métricas, umbrales de aceptación y estrategia de pruebas.

## Fase 3: Construcción incremental del núcleo (corte 2)

- 1. Esqueleto arquitectónico: implementación de extremo a extremo de los flujos de registro y comparación de precios, suficiente para validar las decisiones estructurales.

- 2. TDD en las reglas de negocio: desarrollo guiado por pruebas de las reglas del dominio, como la normalización por unidad de medida y la vigencia y confiabilidad de los precios.

- 3. Despliegue reproducible e integración continua: el equipo decide el proveedor, el modelo de servicio y las herramientas, y documenta la decisión en un ADR.

## Fase 4: Evolución del producto (cortes 2 y 3)

- 1. Introducción del cambio: presentación del requerimiento del módulo comercial.

- 2. Análisis de impacto: identificación de los componentes afectados y estimación del esfuerzo antes de modificar el sistema.

- 3. Implementación e integración: construcción del módulo comercial sobre el núcleo, con actualización del documento de arquitectura y de los ADRs.

## Fase 5: Evaluación y cierre (corte 3)

- 1. Evaluación de la arquitectura: evaluación basada en escenarios, inspirada en ATAM, para identificar riesgos, puntos de sensibilidad y trade-offs, y contraste entre el esfuerzo estimado y el esfuerzo real del cambio.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

- 2. Evaluación de la calidad: aplicación del marco de ISO/IEC 25040 al producto y del modelo ISO/IEC 25012 a los datos, con pruebas de integración, de sistema y de carga.

- 3. Reflexión sobre el proceso y plan de mejora: análisis de la calidad del proceso seguido por el equipo y formulación de acciones de mejora.

Versión:

Fecha:

Página 9 de 15

## 8.1 Mínimos exigibles y decisiones del equipo

Para que la evaluación sea comparable entre equipos sin restringir sus decisiones, se distinguen los elementos que todos deben presentar de aquellos que cada equipo define.

| Mínimos exigibles a todos los equipos | Decisiones de cada equipo |
| --- | --- |
| Documentación de la arquitectura con el modelo C4. | Estilo arquitectónico y granularidad del sistema. |
| Registro de decisiones arquitectónicas (ADRs), incluidas las alternativas descartadas. | Patrones arquitectónicos que se aplican y los que se descartan. |
| API documentada con el estándar que corresponda al estilo elegido (por ejemplo, OpenAPI para REST o el esquema para GraphQL). | Estilo de API y mecanismos de comunicación entre componentes. |
|   | Modelo de datos y estrategia de persistencia. |
|   | Proveedor y modelo de servicio en la nube, y uso o no de orquestación de contenedores. |
| Pruebas automatizadas, con las reglas de negocio desarrolladas mediante TDD. | Mecanismos para asegurar la confiabilidad de los datos colaborativos. |
| Repositorio Git con historial que evidencie el trabajo de todos los integrantes. | Características de calidad priorizadas, sus métricas y umbrales. |
| Despliegue reproducible del sistema. | Lenguajes, frameworks y herramientas. |
| Evaluación de calidad con métricas y umbrales propios, conforme a ISO/IEC 25040. |   |

## 9. Entregables de cada corte por asignatura

Los entregables se numeran de manera continua por asignatura para facilitar su seguimiento en el cronograma.

## Corte 1 (30 %)

| Asignatura | Entregables específicos |
| --- | --- |
|   | 1. Documento de arquitectura v1 del núcleo: contexto del problema; |
|   | requisitos y escenarios de calidad que determinan la arquitectura; |
| Arquitectura de | comparación de al menos dos alternativas candidatas; arquitectura |
| Software II | seleccionada en modelo C4; y contrato preliminar de la API. |
|   | 2. Registro inicial de decisiones arquitectónicas (ADRs): cada decisión |
|   | estructural con su contexto, alternativas consideradas, decisión adoptada y |
| consecuencias. |   |


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 10 de 15

| Asignatura | Entregables específicos |
| --- | --- |
|   | 1. Plan de aseguramiento de calidad: modelo de calidad adoptado y su |
|   | justificación frente a al menos un modelo clásico (McCall, Boehm o |
|   | FURPS+); características y subcaracterísticas de ISO/IEC 25010:2023 |
|   | priorizadas, con la razón de su prioridad; métricas, umbrales de aceptación y |
| Modelos de Calidad | estrategia de pruebas. |
|   | 2. Especificación de requisitos y calidad de datos: requisitos funcionales |
|   | y no funcionales del núcleo, escenarios de calidad refinados, características |
|   | de ISO/IEC 25012 críticas para los datos de precios y matriz de trazabilidad |
|   | entre requisitos, escenarios y pruebas. |

## Corte 2 (30 %)

| Asignatura | Entregables específicos |
| --- | --- |
|   | 3. Núcleo funcional desplegado: registro y comparación de precios |
|   | operando de extremo a extremo, desplegados de forma reproducible y con la |
| API documentada. Arquitectura de |   |
| Software II | 4. Análisis de impacto y arquitectura v2: efecto del módulo comercial |
|   | sobre la arquitectura existente, estimación del esfuerzo, arquitectura |
|   | actualizada y ADRs nuevos o reemplazados. |
|   | 3. Informe de TDD y análisis estático: evidencia del ciclo prueba, código y |
|   | refactorización en las reglas de negocio; cobertura; resultados del análisis |
| Modelos de Calidad | estático y acciones sobre los hallazgos críticos. |
|   | 4. Prototipo con prueba de usabilidad: prototipo de los flujos de registro y |
|   | consulta de precios, con los resultados de una prueba con usuarios frente al |
| escenario EC-01. |   |

## Corte 3 (40 %)

| Asignatura | Entregables específicos |
| --- | --- |
|   | 5. Sistema integrado: núcleo y módulo comercial integrados y desplegados, |
|   | con demostración funcional. |
| Arquitectura de | 6. Evaluación de la arquitectura y documento final: evaluación basada en |
| Software II | escenarios con riesgos, puntos de sensibilidad y trade-offs; análisis de cómo |
|   | respondió la arquitectura al cambio (EC-05), comparando el esfuerzo |
|   | estimado con el real; decisiones que el equipo cambiaría y por qué; |
|   | documento de arquitectura final y registro completo de ADRs. |


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 11 de 15

| Asignatura | Entregables específicos |
| --- | --- |
|   | 5. Informe de evaluación de calidad: evaluación del producto conforme al |
|   | marco de ISO/IEC 25040 y de los datos conforme a ISO/IEC 25012, con |
|   | resultados de pruebas de integración, de sistema y de carga frente a los |
| Modelos de Calidad | umbrales definidos, registro de incidencias y su tratamiento. |
|   | 6. Calidad del proceso y plan de mejora: reflexión sobre el proceso |
|   | seguido por el equipo con referencia a ISO/IEC 330xx o CMMI, a nivel |
|   | conceptual, y plan de mejora del producto y del proceso. |
| Ambas asignaturas | Documento resumen tipo artículo y sustentación del proyecto con |
|   | demostración del sistema. |

Documento resumen. Debe contener las siguientes secciones:

- Resumen (Abstract): breve descripción del alcance y contenido general del artículo, que permita al lector entender rápidamente de qué trata el proyecto.

- Introducción: tema central, contexto y motivación del trabajo realizado.

- Desarrollo de contenidos: sección principal, dividida en secciones y subsecciones claramente identificadas. Debe incluir las decisiones arquitectónicas más relevantes y su evaluación.

- Figuras y tablas: gráficos, diagramas y tablas correctamente numerados, titulados y referenciados en el cuerpo del artículo.

- Conclusiones: principales hallazgos y resultados, destacando las contribuciones más relevantes y las lecciones aprendidas sobre las decisiones tomadas.

- Referencias: lista numerada de las fuentes citadas, siguiendo un formato de referencia específico.

- Reconocimientos (opcional): agradecimientos a personas o instituciones que apoyaron el proyecto y no figuran como autores.

## 10. Evaluación

El proyecto se evalúa dentro de los componentes de evaluación definidos en el microcurrículo de cada asignatura; no constituye un componente adicional.

| Corte | Asignatura | RDA evaluados | Entregables | Componente del |
| --- | --- | --- | --- | --- |
|   |   |   |   | microcurrículo |
|   | Arquitectura de | RDA1 | 1 y 2 | Talleres y trabajo en |
| Primer | Software II |   |   | clase (30 % del corte) |
| corte |   |   |   |   |
| (30 %) | Modelos de | RDA1, RDA2 | 1 y 2 | Talleres y trabajo en |
|   | Calidad |   |   | clase (40 % del corte) |


Código:

## GUÍA PARA LA ELABORACIÓN DEL PROYECTO DEL SEMINARIO NUCLEAR

Versión:

Fecha:

Página 12 de 15

| Corte | Asignatura | RDA evaluados | Entregables | Componente del |
| --- | --- | --- | --- | --- |
|   |   |   |   | microcurrículo |
|   | Arquitectura de | RDA1, RDA2, | 3 y 4 | Talleres y trabajo en |
| Segundo | Software II | RDA3 |   | clase (30 % del corte) |
| corte |   |   |   |   |
| (30 %) | Modelos de | RDA2, RDA3 | 3 y 4 | Talleres y trabajo en |
|   | Calidad |   |   | clase (40 % del corte) |
|   | Arquitectura de | RDA1, RDA3, | 5, 6, documento | Proyecto final (40 % del |
|   | Software II | RDA4 | resumen y | corte) |
| Tercer |   |   | sustentación |   |
| corte |   |   |   |   |
| (40 %) | Modelos de | RDA1, RDA2, | 5, 6, documento | Proyecto final (40 % del |
|   | Calidad | RDA3 | resumen y | corte) |
|   |   |   | sustentación |   |

- En los cortes 1 y 2, los entregables del proyecto forman parte del componente “Talleres y trabajo en clase”. El docente definirá al inicio del periodo la proporción de ese componente que les corresponde.

- En el corte 3, el proyecto constituye el componente “Proyecto final”, que equivale al 16 % de la nota definitiva de cada asignatura (40 % del corte 3, que a su vez pesa el 40 %).

- Criterio transversal de valoración: se valora la calidad de la justificación y la coherencia entre escenarios de calidad, decisiones y evidencia, no la elección de una tecnología o de un patrón particular. Dos equipos con arquitecturas distintas pueden obtener la máxima valoración, y una decisión que resultó inadecuada y que el equipo identificó, documentó y corrigió se valora positivamente.

- La contribución individual se verificará mediante el historial del repositorio y durante la sustentación.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 13 de 15

## 11. Cronograma de actividades del proyecto

| FECHA | ACTIVIDAD | RECURSOS | RESPONSABLE |
| --- | --- | --- | --- |
|   | Conformación de equipos y |   |   |
|   | presentación del problema. |   |   |
|   | Análisis de actores, benchmarking, | Herramientas de |   |
| Corte 1 (por | requisitos y escenarios de calidad. | modelado C4 y |   |
| definir según |   | diagramación a | Equipo del |
| calendario | Alternativas candidatas, arquitectura v1 | elección del equipo. | proyecto |
| académico) | y plan de calidad. | Plantilla de ADR. |   |
|   | Revisión de diseño en clase. | Repositorio Git. |   |
|   | Entrega: entregables 1 y 2 de cada |   |   |
|   | asignatura. |   |   |
|   | Construcción del núcleo con TDD y | Entorno y frameworks |   |
|   | despliegue reproducible. | a elección del equipo. |   |
|   | Análisis estático, prototipo y prueba de | Herramienta de |   |
| Corte 2 (por | usabilidad. | análisis estático (por |   |
| definir según | Presentación del requerimiento del | ejemplo, SonarQube). | Equipo del |
| calendario | módulo comercial y análisis de impacto. | Nube o contenedores | proyecto |
| académico) |   | según la decisión del |   |
|   | Revisión de diseño en clase. | equipo. |   |
|   | Entrega: entregables 3 y 4 de cada | Herramienta de |   |
|   | asignatura. | pruebas de API. |   |
|   | Construcción e integración del módulo |   |   |
|   | comercial. |   |   |
|   | Pruebas de integración, de sistema y | Herramienta de |   |
|   | de carga. | pruebas de carga a |   |
| Corte 3 (por |   | elección (por ejemplo, |   |
| definir según | Evaluación de la arquitectura y de la | k6 o JMeter). | Equipo del |
| calendario | calidad del producto y de los datos. | Repositorio Git. | proyecto |
| académico) | Elaboración del documento resumen y |   |   |
|   | sustentación. | Presentación de |   |
|   |   | sustentación. |   |
|   | Entrega: entregables 5 y 6, documento |   |   |
|   | resumen y sustentación. |   |   |

Las fechas y lugares de ejecución del proyecto son susceptibles a cambios, según necesidades del programa o directrices de la decanatura.

## 12. Aspectos éticos y disciplinarios

## Consideraciones éticas

- 1. Neutralidad y transparencia de la comparación: los criterios con que se ordenan los resultados deben ser explícitos para el usuario. El contenido promocional debe


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 14 de 15

- distinguirse claramente del resultado de la comparación, y ninguna relación comercial puede alterar ese resultado.

- 2. Privacidad por diseño: la plataforma recolectará solo la información estrictamente necesaria. La ubicación y la actividad de los reportantes son datos personales; no deben exponerse públicamente ni asociarse a su identidad sin autorización.

- 3. Equidad entre comercios: el diseño no debe favorecer estructuralmente a los establecimientos con más recursos. Todo comercio debe poder solicitar la corrección de información errónea sobre su negocio.

- 4. Accesibilidad: el diseño de las interfaces tomará como referencia las pautas WCAG 2.2, nivel AA.

- 5. Integridad académica: se exige originalidad en el código y la documentación. Las contribuciones individuales se verificarán mediante el historial de commits y pull requests. El uso de herramientas de inteligencia artificial generativa se regirá por las orientaciones del docente y debe declararse; cada integrante debe estar en capacidad de explicar y defender las decisiones y el código de su equipo.

## Marco legal

- 1. Protección de datos personales: cumplimiento de la Ley 1581 de 2012 y sus decretos reglamentarios, compilados en el Decreto 1074 de 2015, incluidos la autorización del titular, la finalidad del tratamiento, la política de tratamiento de datos y los procedimientos de consulta y reclamo.

- 2. Protección al consumidor: consideración de la Ley 1480 de 2011 (Estatuto del Consumidor) en lo relativo a la información de precios, la publicidad y las promociones y ofertas que publiquen los comercios.

- 3. Comercio electrónico: términos y condiciones de uso y aceptación electrónica conforme a la Ley 527 de 1999.

- 4. Libre competencia: la plataforma no debe facilitar acuerdos ni coordinación de precios entre competidores, conforme a la Ley 155 de 1959 y la Ley 1340 de 2009.

- 5. Propiedad intelectual: protección del software desarrollado conforme a la Ley 23 de 1982 y la Decisión Andina 351 de 1993; respeto de las licencias de los componentes de terceros; y, si el equipo decide obtener datos de sitios web de terceros, respeto de sus términos de uso.

## 13. Asesoría y acompañamiento

Las asesorías se acordarán con cada uno de los grupos por medio del correo electrónico institucional. Adicionalmente, en cada corte se realizará al menos una revisión de diseño en clase, en la que cada equipo presenta sus decisiones y las somete a discusión con el docente y con los demás equipos.


Código:

## PROYECTO DEL SEMINARIO NUCLEAR GUÍA PARA LA ELABORACIÓN DEL

Versión:

Fecha:

Página 15 de 15

## 14. Bibliografía y recursos educativos

## Arquitectura de software

- Bass, L., Clements, P., & Kazman, R. (2021). Software architecture in practice (4th ed.). Addison-Wesley Professional.

- Cervantes, H., & Kazman, R. (2016). Designing software architectures: A practical approach. Addison-Wesley Professional.

- Richards, M., & Ford, N. (2020). Fundamentals of software architecture: An engineering approach. O’Reilly Media.

- Newman, S. (2021). Building microservices: Designing fine-grained systems (2nd ed.). O’Reilly Media.

- Kleppmann, M. (2017). Designing data-intensive applications. O’Reilly Media.

- Brown, S. (s. f.). The C4 model for visualising software architecture. https://c4model.com

- Nygard, M. (2011). Documenting architecture decisions. Cognitect.

## Calidad de software

- ISO/IEC 25010:2023. Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — Product quality model. International Organization for Standardization.

- ISO/IEC 25012:2008. Software engineering — Software product Quality Requirements and Evaluation (SQuaRE) — Data quality model. International Organization for Standardization.

- ISO/IEC 25040:2024. Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — Quality evaluation framework. International Organization for Standardization.

- CMMI Institute. (2023). CMMI V3.0: Model at a glance. CMMI Institute.

- Beck, K. (2003). Test-driven development: By example. Addison-Wesley.

- Piattini, M., et al. (2020). Calidad de sistemas de información (5.ª ed.). RA-MA Editorial.

- W3C. (2023). Web Content Accessibility Guidelines (WCAG) 2.2. World Wide Web Consortium.
