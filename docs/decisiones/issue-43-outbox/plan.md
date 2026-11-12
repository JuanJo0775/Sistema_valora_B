# Plan — issue #43: bus de eventos con outbox

- **Objetivo:** que un módulo publique un evento dentro de su transacción, y que el repartidor lo entregue a los suscriptores al menos una vez, sin perder confirmados, sin entregar revertidos y sin procesar repetidos.
- **Relación:** issue padre #12, épica #9, ADR-015, ADR-021, EC-02, EC-05, P8.
- **Fuera de alcance:**
  - Eventos de negocio reales (llegan con #14).
  - La entrega síncrona de `PrecioOficialPublicado` (con `commerce`).
  - La retención de los eventos.

## Dependencias

Ninguna nueva. Los identificadores se generan con `randomUUID` de `node:crypto`.

## Rama y pull request

`feat/shared-outbox`, que sale de `dev`. Un pull request hacia `dev` con `Closes #43`.

## Diseño (`src/shared/events/`)

- **`index.ts`:** interfaz pública con `EventsModule`, el tipo `DomainEvent`, `createEvent`, `OutboxPublisher` y `EventBus`.
- **`DomainEvent`:**
  - Campos: `id` (uuid), `type`, `version`, `occurredAt` y `payload`.
  - `createEvent(type, version, payload)` asigna el `id` y la fecha.
- **`infrastructure/schema.ts`:** esquema `shared` con dos tablas:
  - `outbox`: id, type, version, payload (jsonb), occurred_at, delivered_at, failed_at, attempts, last_error, más un índice de pendientes.
  - `processed_events`: consumer y event_id como clave, y processed_at.
- **`OutboxPublisher.publish(tx, event)`:** escribe el evento en `shared.outbox` usando la transacción que recibe. La usan los repositorios de `infrastructure/`, que guardan su cambio y el evento juntos.
- **`EventBus`:**
  - `subscribe(consumer, type, handler)`.
  - `deliver(event)` abre, para cada suscriptor, una transacción que registra (consumer, event_id) en `processed_events`. Si el par ya existía, lo omite. Si no, llama al handler con la misma transacción.
- **`OutboxRelay`:**
  - `runOnce()` toma los pendientes en orden de llegada (`FOR UPDATE SKIP LOCKED`, por si un día hay varias copias de la API) y entrega cada uno.
    - Si funciona, lo marca como entregado.
    - Si falla, suma un intento y guarda el error.
    - Al llegar a `OUTBOX_MAX_ATTEMPTS`, lo marca como fallido y lo registra en el log.
  - Al arrancar la app se programa cada `OUTBOX_POLL_INTERVAL_MS`, y se detiene al apagarla.
- **Configuración:**
  - `OUTBOX_POLL_INTERVAL_MS` y `OUTBOX_MAX_ATTEMPTS`, enteros ≥ 1, validados al arrancar.
  - En `.env.example` van `5000` y `5`.
- **Migración:** `pnpm db:generate` crea la `0001` (esquema `shared` y sus dos tablas). Se revisa en el pull request.
- **Regla de dependencias:** se amplía la de la #42 para permitir `src/shared/*/infrastructure/` (aquí vive el esquema de `shared`).

## Ciclos TDD

Cada ciclo es un commit `test(shared)` (rojo) y otro `feat(shared)` (verde), más un `refactor` si hace falta.

1. Configuración: sin `OUTBOX_POLL_INTERVAL_MS` u `OUTBOX_MAX_ATTEMPTS`, la app no arranca y el mensaje nombra la variable.
2. Un evento publicado en una transacción confirmada llega al suscriptor con su tipo, su versión y sus datos.
3. Un evento publicado en una transacción revertida no se entrega nunca.
4. Un evento pendiente se entrega aunque la app se reinicie antes de repartirlo.
5. Un evento repetido no se procesa dos veces para el mismo receptor.
6. Si el suscriptor falla, el evento queda pendiente con un intento más y el error guardado, y se reintenta en la siguiente revisión.
7. Al quinto fallo el evento queda fallido y no se reintenta, y los demás eventos se siguen entregando.
8. Con la app encendida, el repartidor entrega solo, sin llamarlo, según el intervalo configurado.

Las pruebas son de integración contra `valora_test`, llaman a `runOnce()` directamente (salvo el ciclo 8), y vacían `shared.outbox` y `shared.processed_events` antes de cada prueba.

## Después

- Migración `0001` generada y revisada. Commit `feat(shared)`, dentro del ciclo que la necesite.
- **`DECISIONS.md`:**
  - Bus propio en lugar de `@nestjs/event-emitter`.
  - Valores iniciales de 5 s y 5 intentos.
  - Pendientes: retención y entrega síncrona.
- **README:** las variables nuevas.
- **`.env.example`:** las variables nuevas.
- **Esta carpeta de decisiones.**

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- Los cuatro criterios de la issue #43 cubiertos por pruebas (ciclos 2 a 5).

## Riesgo

El pull request puede superar las 400 líneas (esquema, migración generada, bus, repartidor y pruebas). La migración generada suma volumen sin lógica. Si queda muy grande, se parte en dos: «outbox y publicación» y «repartidor».

## Notion

- **[EPIC-B00]:** la fila 3c (#43) pasa a «PR abierto…» y luego a «Terminado…».
- Al cerrarse la #43 se cierra la #12, y el paso 3 del H2-01 queda terminado.
