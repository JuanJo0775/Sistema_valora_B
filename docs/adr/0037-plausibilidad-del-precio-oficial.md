# ADR-037: Plausibilidad del precio oficial: rechazo automático y revisión sin referencia

- **Estado:** Aceptado (cierre final del proyecto, 2026-11-27)
- **Fecha:** 2026-11-24
- **Responsables:** integrante que dirige el backend; revisado por el equipo.
- **Escenarios relacionados:** EC-02 (precio oficial), EC-03 (reportes maliciosos y datos erróneos), EC-05 (el núcleo no depende de commerce), EC-08 (privacidad)
- **Requisitos relacionados:** RF-013, RF-016, RF-017; ADR-008, ADR-030
- **Origen:** hallazgo H19 del informe de la prueba de usuario del módulo de comerciante y de moderación (24-nov-2026).

## Contexto

La prueba de usuario con un comerciante verificado mostró que **los precios oficiales se saltan la detección de precios anómalos**. Un precio de $300 por 1 kg de arroz (las demás tiendas, cerca de $5.200) quedó `source: oficial`, `vigente` e `isCheapest: true`; uno de $52.000 también se aceptó, sin aviso. Es exactamente el hueco que el ADR-030 cerró para los reportes de la comunidad (el caso de $12 por 1 kg de arroz): ahí un precio atípico queda `en_revision`, fuera del titular y en la cola de moderación; en `PUT /v1/commerce/prices`, la carga CSV y las promociones solo regía el piso y el techo absolutos ($100 a $5.000.000).

Es más grave que en un reporte por tres razones:

1. La marca «oficial» hace que el público crea más el precio (ADR-008: sin reportes que lo contradigan, el oficial es el precio mostrado).
2. Un precio oficial reemplaza y vence como un reporte, pero **no pasa por reliability**: nadie lo revisa jamás.
3. Combinado con H11 (una tienda de cadena sin dueño se verifica al instante) y H6 (la ficha pública no distingue lo oficial), un falso «oficial» barato de una cadena conocida podría salir como el mejor precio.

El equipo decidió que la verificación debe ser **automatizada**: un moderador no puede revisar cada precio que publica un comercio (con la carga CSV pueden ser 1.000 filas por archivo).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Dejar el oficial sin evaluación y confiar en la verificación del comercio | Cero cambios | Es el hallazgo H19: un precio absurdo es titular «Más barato» y «oficial» |
| B. Mandar todo precio oficial a moderación | Máxima seguridad | Inviable: un moderador no revisa cada precio; los comercios no podrían publicar |
| C. Solo advertir en el cliente (confirmar si el precio cambia mucho) | Mejor experiencia | Se salta con una llamada directa a la API; es la misma debilidad que ADR-030 descartó |
| D. Rechazar todo lo que no pase, también sin referencia | Simple | Sin 3 tiendas ni SIPSA no hay con qué comparar: se rechazaría a comercios honestos de productos nuevos o de pocas tiendas (arranque en frío) |
| E. Evaluar con la referencia de ADR-030: rechazo automático fuera de rango; «en revisión» sin referencia | Automático, explicable, reutiliza reglas y parámetros ya medidos; solo lo ambiguo llega a una persona | Cambia el contrato (nuevo 422, estado nuevo); un comercio puede ver su precio «en revisión» |

## Decisión

Se adopta **E**. El precio oficial se compara con la referencia **del mismo producto y presentación**, con las reglas y los parámetros del ADR-030 (`assessAgainstFallback`, `PLAUSIBILITY_PARAMS`; no se agrega ningún parámetro):

1. **Orden de la referencia** (la misma que ADR-030 para el arranque en frío): (a) la mediana del precio normal vigente de esa presentación en **otras tiendas del mismo municipio**, al menos `minPeerStores` (3) tiendas distintas, datos iniciales incluidos; (b) si no alcanzan, el mayorista **SIPSA** (solo productos de peso, reciente, ≤ 30 días); (c) si no hay ninguna, `sin_referencia`. El piso y el techo absolutos de ADR-030 siguen rigiendo antes de todo (422 `IMPLAUSIBLE_PRICE`).
2. **Tres resultados:**
   1. **Dentro de rango** → se publica como oficial vigente, igual que antes (`OfficialPricePublished`).
   2. **Claramente fuera de rango** (menos de `lowRatio` = 40 % o más de `highRatio` = 250 % de la mediana; menos de `wholesaleMinRatio` = 50 % del mayorista; el límite exacto es normal) → **rechazo automático**: `422` con código estable nuevo `IMPLAUSIBLE_OFFICIAL_PRICE` y un mensaje en español que dice el rango de referencia (por ejemplo «Tu precio de $300 está fuera de lo normal para esta presentación. Lo más barato que vemos es $3.950 y lo más caro $4.600. Revisa si faltan o sobran ceros.»; con SIPSA, el precio mayorista de referencia). No se guarda ni se publica nada.
   3. **Sin referencia** → el precio **se acepta pero queda «en revisión»**: no es oficial vigente ni titular «Más barato», no sale en la comparación como oficial y entra a la cola de moderación con el motivo nuevo `sin_referencia`. Si moderación lo aprueba pasa a oficial vigente (confirmado en ese momento); si lo descarta, se retira.
3. **Dónde se aplica:** `PUT /v1/commerce/prices`; `POST /v1/commerce/prices/bulk` (cada fila pasa por la misma evaluación: las rechazadas salen como errores por fila con el mismo mensaje y código; las «en revisión» se informan aparte en `inReview`); y las promociones (`POST /v1/commerce/promotions`): el precio resultante de «Precio especial», «Descuento porcentual» o «Pague X lleve Y» no puede quedar por debajo de `lowRatio` de la mediana (o de `wholesaleMinRatio` del mayorista); solo se vigila el lado bajo porque una promoción siempre baja un oficial que ya pasó su evaluación. Sin referencia no se frena. `POST /v1/commerce/prices/reconfirm` no cambia el precio y no se evalúa.
4. **Modelo de datos: el oficial «en revisión» no es un reporte.** Los mecanismos de reportes (`PriceFlagged`, `PriceAssessed`, `PriceWithdrawn`) están ligados a `observations` y a `comparison.price_current` y cuentan como corroboración en la resolución oficial/reportado (ADR-008). Meter el precio oficial ahí lo mezclaría con los reportes de la comunidad. Por eso se reutiliza **el patrón** (cola de moderación, decisión con motivo en la bitácora inmutable, eventos por el outbox) con tablas propias, con el menor cambio:
   - `commerce.official_price_reviews` guarda el precio enviado que espera (uno por tienda y presentación, con el id del caso). No es el oficial: `commerce.official_prices` y la copia de `comparison` solo contienen precios vigentes, así que la comparación, «Más barato», las promociones, los avisos y «Todos mis precios siguen igual» no cambian.
   - commerce publica `OfficialPriceHeld` v1 (con la clave seudónima de la cuenta, EC-08); reliability lo guarda en `reliability.official_reviews` y lo muestra en `GET /v1/moderation/queue` con `reason: sin_referencia`, sin mediana ni desviación y `reportersCount: 0`. El `id` del elemento es el del caso.
   - La decisión (`POST /v1/moderation/{itemId}/decision`) queda en `moderation_log` y reliability publica `OfficialPriceReviewed` v1 (`aprobado` o `descartado`). commerce lo escucha por su nombre (EC-05: el núcleo no importa commerce) y, si aprueba, publica el precio como oficial vigente con `OfficialPricePublished` (comparison lo copia como siempre). `observar_cuentas` no aplica (422 `DECISION_NOT_ALLOWED`); no se toca la reputación de nadie; un moderador no decide sobre su propio precio (409 `OWN_REPORT`).
   - Un precio en revisión **no reemplaza** al oficial anterior de esa presentación, que sigue vigente hasta que se apruebe el nuevo. Enviar otro precio de esa presentación, publicar uno dentro de rango o retirar la tienda (revocación, borrado de cuenta) cierra la revisión pendiente (`OfficialPriceReviewClosed`) y sale de la cola. Una decisión sobre una revisión que ya no existe no hace nada.
5. **La referencia llega a commerce por la interfaz pública de `pricing`**: `GatherPlausibilityContext` (ADR-030) se exporta por `pricing/index.ts`; commerce no lee tablas ajenas. `pricing` no importa commerce.
6. **Contrato** (`docs/openapi.yaml`): respuesta de `PUT /v1/commerce/prices` con `status: 'vigente' | 'en_revision'`; `GET /v1/commerce/prices` agrega `inReview`; `POST .../bulk` agrega `inReview` y el código de fila `IMPLAUSIBLE_OFFICIAL_PRICE`; 422 `IMPLAUSIBLE_OFFICIAL_PRICE` en el PUT y en las promociones; `sin_referencia` en la cola.

## Parámetros

Ninguno nuevo: se usan `lowRatio` (0,4), `highRatio` (2,5), `minPeerStores` (3), `wholesaleMinRatio` (0,5) y el piso y techo absolutos de `PLAUSIBILITY_PARAMS` (`src/domain/price-plausibility.ts`), provisionales como en ADR-030. El frontend debe usar los mismos para cualquier aviso previo y cambiar junto con ellos. Se recalibran con la cola real: cada «aprobar» sobre un `sin_referencia` es un caso en que el comercio tenía razón y la referencia faltaba.

Constante de implementación (no es una regla de negocio): la carga por archivo consulta la referencia de 20 filas a la vez para acotar las consultas.

## Consecuencias

- Positivas: el caso del informe deja de ser posible ($300 y $52.000 por 1 kg de arroz, con referencia, devuelven 422 y no se guarda nada); el oficial cumple la misma defensa del servidor que un reporte; solo lo que no tiene con qué compararse llega a una persona; se reutilizan reglas puras y parámetros ya probados y medidos; la comparación y el resto del módulo comercial no cambian.
- Negativas / riesgos:
  - **Falsos positivos:** un precio legítimo muy distinto (una liquidación al 60 % de descuento, un producto de gran formato) se rechaza. El comercio ve el rango y puede corregir; si el problema persiste, el camino es una excepción por categoría en un ADR posterior, no subir los umbrales en general.
  - **El «en revisión» puede acumularse** en el arranque en frío (hoy casi todas las presentaciones tienen menos de 3 tiendas con precio en un municipio pequeño): recarga la cola. Mitigación: pasa solo para precios nuevos sin referencia y se recalibra con la cola real; el piso y el techo absolutos siguen rigiendo.
  - **Fraude ajustado al umbral:** quien conoce el 40 % publica $1.100 sobre una mediana de $2.600; es el mismo límite de ADR-030 y se complementa con las denuncias de comercio (D3) y los reportes que contradicen al oficial (ADR-008).
  - **Un precio en revisión que no se decide** sigue sin ser oficial (no es un problema de seguridad, sí de experiencia). La moderación lo ve en la cola.
  - La referencia por tiendas mezcla formatos distintos; con pocas tiendas o datos iniciales viejos puede sesgarse. Por eso exige 3 tiendas y usa la mediana (ADR-030).
- Trade-offs aceptados: la referencia es una foto al momento de enviar el precio; la aprobación no la vuelve a calcular. La aprobación confirma el precio al aprobar, no al enviar.
- Fuera de alcance: H11 (verificación inmediata de tiendas de cadena), H6 (señal de oficial en la ficha pública), H20 (promociones solapadas) y el aviso previo en el cliente por un cambio grande frente al precio anterior de la misma tienda.

## Verificación

- Dominio: `src/domain/price-plausibility.spec.ts` (límites exactos: $1.679, $1.680, $10.500 y $10.501 sobre una mediana de $4.200; SIPSA; promociones solo por el lado bajo).
- Casos de uso: `publish-official-price.spec.ts`, `upload-official-prices.spec.ts`, `create-promotion.spec.ts`, `merchant-official-prices.spec.ts`, `apply-official-price-review.spec.ts`; en reliability, `moderation-queue.spec.ts` y `decide-moderation.spec.ts`.
- Integración: `test/integration/official-price-plausibility.spec.ts` (el 422, el «en revisión», la cola, aprobar y descartar, el reemplazo, la carga CSV y las promociones) y los ajustes a las pruebas de comercio (cada una crea tres tiendas de referencia).
- Contrato: `docs/openapi.yaml` y `test/contract/commerce.contract.spec.ts`.
