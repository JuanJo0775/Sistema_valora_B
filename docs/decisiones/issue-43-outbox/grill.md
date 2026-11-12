# Grill — issue #43: bus de eventos con outbox

- **Fuentes:**
  - Issue #43 (parte 3 de #12).
  - ADR-015, aceptado el 11-nov-2026 con el patrón outbox.
  - ADR-021 (Drizzle).
  - Regla `arquitectura-monolito-modular.md`, punto 6.
  - EC-02, EC-05 y P8.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Lo que ya estaba definido (ADR-015)

- **Tabla:** outbox en el esquema `shared`, con el tipo y la versión del evento, los datos en JSON, la fecha, si se entregó, los intentos y el último error.
- **Escritura:** el evento se escribe en la misma transacción que el cambio que lo causa. Si la transacción se revierte, el evento no existe.
- **Repartidor:** dentro del mismo proceso, entrega los pendientes cada cierto intervalo, que es parametrizable. EC-02 exige que todo ocurra en menos de 5 minutos.
- **Entrega:** al menos una vez. Cada receptor registra los eventos ya procesados para no repetirlos.
- **Contratos:** cada evento lleva tipo y versión, y no cambia sin una versión nueva.
- **Excepción:** `PrecioOficialPublicado` se procesa dentro de la misma transacción (EC-02).
- **Sin broker externo** en el MVP.
- **Criterios de la issue #43:**
  - Un evento solo se entrega si su transacción confirma.
  - Un pendiente se entrega aunque el proceso se reinicie.
  - Un repetido no se procesa dos veces.
  - Los contratos llevan tipo y versión.

## Preguntas

### 1. Bus de eventos

- **Opciones:**
  - (a) Bus propio y mínimo en `src/shared/events/`: lista de suscriptores por tipo de evento, que entrega y espera a que terminen.
  - (b) `@nestjs/event-emitter` (dependencia nueva; por defecto no espera al suscriptor ni informa si falló).
- **Recomendación:** (a).
  - El outbox necesita saber si la entrega funcionó para marcar o reintentar; con (b) habría que escribir lo mismo, más una dependencia.
  - YAGNI: comodines y espacios de nombres no los usa ningún paso.
  - El flujo completo queda en código del proyecto, visible en el ciclo TDD.
- **Decisión:** (a). ADR-015 se cumple igual: el bus es interno y se puede cambiar por un broker sin tocar los eventos. Se anota en `DECISIONS.md`, porque ADR-018 mencionaba `@nestjs/event-emitter` como posibilidad.

### 2. Intervalo del repartidor

- **Opciones:**
  - (a) 5 segundos.
  - (b) 1 segundo.
  - (c) 30 segundos.
- **Recomendación:** (a). Está muy por debajo del límite de 5 minutos de EC-02, se siente rápido y la carga sobre la base es mínima (12 consultas livianas por minuto).
- **Decisión:** (a). Variable `OUTBOX_POLL_INTERVAL_MS`, validada al arrancar, con `5000` en `.env.example`. Es un valor inicial calibrable, no un umbral aprobado.

### 3. Qué pasa si entregar un evento falla

- **Opciones:**
  - (a) Reintentar en cada revisión hasta 5 intentos y luego marcarlo como fallido, guardando el último error.
  - (b) Reintentar para siempre.
  - (c) Más intentos o espera creciente entre intentos.
- **Recomendación:** (a).
  - Cubre los fallos pasajeros sin insistir eternamente en uno permanente.
  - Ningún evento se pierde: el fallido queda guardado con su error.
  - La espera creciente añade lógica que hoy nada necesita; se agrega si la prueba de carga (EC-04) lo pide.
- **Decisión:** (a).
  - Variable `OUTBOX_MAX_ATTEMPTS`, con `5` en `.env.example` (valor inicial calibrable).
  - Un evento fallido se registra en el log y no bloquea a los siguientes.
  - Se reactiva a mano después de corregir la causa.

### 4. Dónde se recuerda qué eventos ya procesó cada receptor

- **Opciones:**
  - (a) Una tabla común `shared.processed_events` (receptor, id del evento), manejada por el bus. El registro y el trabajo del suscriptor van en la misma transacción.
  - (b) Cada módulo guarda y revisa sus eventos procesados en su propio esquema.
- **Recomendación:** (a).
  - Nadie puede olvidarse de la protección contra repetidos.
  - El criterio de la issue se cumple en un solo lugar, con una sola prueba.
  - Es infraestructura compartida en `shared`; ningún módulo lee las tablas de otro.
- **Decisión:** (a). Si el suscriptor falla, la transacción se revierte, el evento no queda como procesado y el reintento lo vuelve a llamar.

### 5. Qué se hace con los eventos ya entregados

- **Opciones:**
  - (a) Conservarlos por ahora, sin borrar nada.
  - (b) Borrar los entregados después de N días con una tarea periódica.
- **Recomendación:** (a).
  - YAGNI: el volumen del MVP es pequeño.
  - Sirven como evidencia para el informe de calidad y para depurar.
  - Borrar no se puede deshacer, y el número de días sería inventado; ADR-003 prevé «particionado o archivo a futuro».
- **Decisión:** (a). Pendiente en `DECISIONS.md`: definir la retención de `shared.outbox` y `shared.processed_events` cuando haya datos de volumen (ADR-003).

### 6. Entrega síncrona de `PrecioOficialPublicado`

- **Contexto:** ADR-015 dice que `PrecioOficialPublicado` se procesa dentro de la misma transacción (EC-02). Ese evento lo publica `commerce`, que llega en el corte 3 (RF-015 a RF-019).
- **Opciones:**
  - (a) Dejarla para cuando exista `commerce`. La #43 construye solo la entrega por outbox, y el bus queda preparado para agregar la entrega síncrona sin cambiar los módulos.
  - (b) Construirla ya, probada con un evento que solo existe en las pruebas.
- **Recomendación:** (a).
  - YAGNI: ningún módulo actual la usa.
  - EC-05: agregar una forma de entrega sin tocar a los demás es justo lo que mide ese escenario.
  - Se diseña mejor con el caso real, incluida la medida de 5 minutos de EC-02.
- **Decisión:** (a). Pendiente en `DECISIONS.md`, ligado al módulo comercial.

## Resumen

| Tema | Decisión |
|---|---|
| Bus | Propio y mínimo en `src/shared/events/` (sin `@nestjs/event-emitter`) |
| Intervalo del repartidor | 5 segundos (`OUTBOX_POLL_INTERVAL_MS=5000`, calibrable) |
| Fallos | Hasta 5 intentos (`OUTBOX_MAX_ATTEMPTS=5`, calibrable); luego queda fallido con su error, sin bloquear a los demás |
| Repetidos | Tabla común `shared.processed_events`, en la misma transacción que el trabajo del suscriptor |
| Eventos entregados | Se conservan; la retención se define con datos de volumen |
| `PrecioOficialPublicado` síncrono | Se construye con `commerce` (corte 3) |
