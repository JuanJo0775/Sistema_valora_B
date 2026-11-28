# ADR-023: Entrega del precio oficial a la lectura por el outbox, atómica con la publicación y diferida

- **Estado:** Propuesto
- **Fecha:** 2026-11-26 (borrador de AS-E4 del 16-nov-2026; ajustado al código construido en B#203)
- **Responsables:** equipo de backend; la aceptación la decide el equipo. No hay constancia en el repositorio de la validación con el docente del 23-nov.
- **Escenarios relacionados:** EC-02 (actualización de un precio oficial), EC-05 (el núcleo no conoce `commerce`), EC-04
- **Requisitos relacionados:** RF-016 (RN2), RNF-002. Ajusta ADR-004 y el punto 6 de ADR-015.

## Contexto

RNF-002 pide que el precio oficial anterior deje de verse como vigente en 5 minutos como máximo, en el 100 % de 50 cambios. ADR-004 dice que un cambio de precio oficial actualiza la tabla de lectura de forma síncrona, y el punto 6 de ADR-015 dice que `PrecioOficialPublicado` se procesa en la misma transacción, sin decir cómo. La condición de EC-05 es que el núcleo no importe `commerce`. Hoy el repartidor del outbox revisa cada 5 s (`OUTBOX_POLL_INTERVAL_MS=5000`) y reintenta hasta 5 veces (`OUTBOX_MAX_ATTEMPTS=5`); después el evento queda «fallido» (DECISIONS.md, #43).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Evento por el outbox existente, atómico con la escritura de `commerce` y entregado por el repartidor | No cambia el bus; reutiliza la idempotencia (`processed_events`); 0 imports del núcleo hacia `commerce` | La propagación tarda segundos, no es cero; un evento que agota sus 5 intentos deja el precio anterior visible hasta que alguien intervenga |
| B. `commerce` llama a un comando público de `comparison` | Efecto inmediato | Un segundo mecanismo además de los eventos; `comparison` expondría una escritura pensada para un solo módulo |
| C. `comparison` consulta a `commerce` al leer | Sin copia | Rompe la regla de que `comparison` lee solo su tabla, y pone el esquema de `commerce` en el camino caliente de EC-04 |
| D. Escribir el oficial en `price_current` con una columna `source` | Una sola tabla | Altera una tabla del núcleo y pierde el valor reportado que RF-018 manda mostrar al lado; no es aditivo (EC-05) |
| E. Evento con entrega inmediata a receptores síncronos (`publishNow`) | Propagación cero en el camino feliz, nunca a medias | Toca el bus de eventos; un fallo del receptor hace fallar la publicación; transacción más larga con CSV |

## Decisión

**Se construyó la alternativa A.** El borrador de AS-E4 proponía la E; no se implementó (en `src/shared` no existe `publishNow` ni un modo `enTransaccion`), y los documentos del plan y del grill no registran por qué. Este ADR deja constancia de lo que hay:

1. `commerce` publica `OfficialPricePublished`, `OfficialPricesReconfirmed` y `OfficialPriceWithdrawn` (versión 1) con `outbox.publish(tx, …)`, dentro de la misma transacción que guarda el precio. Si la transacción falla, no hay evento; si se confirma, el evento ya está guardado.
2. `comparison` se suscribe por el nombre del evento (consumidor `OFFICIAL_PRICES_CONSUMER`) y mantiene su propia tabla `comparison.official_prices` con un `upsert` idempotente. El contrato del evento (`OfficialPricePublishedV1`) lo declara el receptor, en `comparison/infrastructure`; `commerce` no exporta tipos al núcleo.
3. La fecha del cambio de precio solo se mueve si el precio cambió: reconfirmar no borra una discrepancia (D1 y D4 del grill).
4. Se mantiene la regla `nucleo-no-conoce-commerce` de dependency-cruiser.

## Consecuencias

- Positivas: el bus y el núcleo no cambian; la entrega es al menos una vez y el receptor es idempotente; el núcleo solo conoce el nombre de los eventos.
- Negativas / riesgos: el precio nuevo se ve en segundos (el ciclo del repartidor), no en la misma operación; **un evento que agota sus reintentos deja el precio anterior visible sin límite de tiempo**, que es justo lo que el borrador de AS-E4 objetaba a esta alternativa, y que contradice la lectura estricta de ADR-004. No hay hoy un aviso ni un reintento manual documentado para ese caso.
- Trade-offs aceptados: consistencia eventual de segundos a cambio de no tocar el bus.
- **PENDIENTE (equipo):** decidir si se acepta este comportamiento (RNF-002 pide 5 minutos, y 5 reintentos de 5 s los cumplen en el camino normal) o si se construye la entrega en la transacción (alternativa E). Mientras tanto, ADR-004 y la frase «misma transacción» del plan B3 deben leerse como «el evento se guarda en la misma transacción».

## Verificación

- `test/integration/commerce-official-prices-http.spec.ts` y `commerce-official-prices-repository.spec.ts`: publicar y reconfirmar.
- dependency-cruiser: `nucleo-no-conoce-commerce` en `pnpm depcheck`.
- **No existe todavía la prueba de 50 cambios que mide el retraso de propagación (RNF-002, p95 y máximo).** Es la evidencia que falta para dar este ADR por cumplido.

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-023).
- Código: `src/modules/commerce/application/publish-official-price.ts`, `src/modules/comparison/infrastructure/official-price-handlers.ts`.
- Issues / PRs: B#203 (precios oficiales), B#210 (este registro). ADR-004, ADR-015.
