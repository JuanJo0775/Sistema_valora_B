# ADR-015: Comunicación entre módulos con eventos de dominio internos

- **Estado:** Aceptado
- **Precisado por:** ADR-023 y ADR-026 (26-nov-2026): el punto 6 («misma transacción») se cumple guardando el evento en la misma transacción; la entrega a `comparison` es por el repartidor. Se retira el evento `PromocionVencida`: el vencimiento de una promoción se calcula al leer.
- **Fecha:** 2026-11-11
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-05
- **Requisitos relacionados:** en Notion hay 4 relaciones con RF y 1 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Evolución / P8 Inmediato vs diferido
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81aba543fce5820857a0)

Fuente: Notion, base ADRs, página 40239c4a833b81aba543fce5820857a0; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- El texto de la alternativa C dice que el broker «contradice ADR-001 y la decisión de no usar Docker en el MVP»; esa regla fue reemplazada el 15-nov-2026 según ADR-012 (ver discrepancia allí). No se corrigió.

## Contexto

El módulo comercial debe incorporarse en el corte 3 sin cambiar el núcleo (EC-05). Necesita reaccionar a hechos del núcleo (por ejemplo, un precio reportado) y el núcleo debe poder consultar sus resultados (por ejemplo, un precio oficial) sin conocer sus detalles. Además, la entrega de los eventos debe ser confiable: si el aviso se publica en memoria y el proceso cae después de guardar, el evento se pierde; si se publica antes de que la transacción confirme y luego se revierte, otros módulos reaccionan a algo que no ocurrió (EC-02, EC-03).

## Alternativas consideradas

A) Llamadas directas entre módulos: simple, pero crea dependencias circulares y obliga a modificar el núcleo.

B) Eventos de dominio dentro del proceso con contratos estables y puertos para consultas. Para la entrega: B1) en memoria (por ejemplo @nestjs/event-emitter): muy simple, pero los eventos se pierden si el proceso cae y no hay reintentos; B2) tabla outbox en la misma transacción más un repartidor en el mismo proceso: no se pierde un evento confirmado ni se entrega uno revertido, con reintentos; a cambio, una tabla y un proceso más, y entrega al menos una vez (los receptores deben ignorar repetidos).

C) Broker de mensajes externo (por ejemplo RabbitMQ o Kafka) desde el inicio: desacople fuerte, pero más infraestructura y complejidad; contradice ADR-001 y la decisión de no usar Docker en el MVP.

## Decisión

ACEPTADA (11 de noviembre de 2026): B con entrega B2 (outbox). Un bus de eventos interno con eventos como PrecioReportado, PrecioOficialPublicado y PromocionVencida, y puertos de consulta; el módulo comercial se suscribe y publica sin que el núcleo dependa de él. Entrega con patrón outbox: 1) tabla outbox en el esquema shared (tipo y versión del evento, datos en JSON, fecha, entregado, intentos, último error); 2) el evento se escribe en la misma transacción que el cambio que lo causa; 3) un repartidor dentro del mismo proceso entrega los pendientes cada cierto intervalo, parametrizable (valor inicial a definir en la issue #12; EC-02 exige menos de 5 minutos); 4) entrega al menos una vez: cada receptor registra los eventos ya procesados para no repetirlos; 5) los contratos de evento llevan versión y no cambian sin una versión nueva; 6) excepción: PrecioOficialPublicado se procesa dentro de la misma transacción (EC-02). Si hace falta, el transporte se cambia a un broker sin tocar el contenido de los eventos.

## Consecuencias

(+) Bajo acoplamiento: el núcleo no se modifica para agregar el módulo comercial.

(+) Ningún evento confirmado se pierde y ninguno revertido se entrega; hay reintentos.

(+) Camino claro hacia un broker si se extrae un módulo.

(−) Seguir el flujo de ejecución es más difícil que con llamadas directas; se compensa con registros y trazas.

(−) Una tabla y un proceso más que operar, y un retraso igual al intervalo del repartidor.

(−) Un evento puede llegar dos veces; los receptores deben ser idempotentes.

(−) Hay que diseñar bien los contratos de evento: son la parte que más cuesta cambiar.

Verificación (issue #12): pruebas de integración que muestran que un evento de una transacción revertida no se entrega, que un pendiente se entrega tras reiniciar y que un repetido no se procesa dos veces.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-015](https://app.notion.com/p/40239c4a833b81aba543fce5820857a0)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
