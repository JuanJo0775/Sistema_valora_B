# ADR-030: Plausibilidad de precios: referencia con arranque en frío y piso absoluto

- **Estado:** Aceptado (decisión del equipo, registrada el 23-nov-2026)
- **Fecha:** 2026-11-17
- **Responsables:** integrante que dirige el backend; revisado por el equipo.
- **Escenarios relacionados:** EC-03 (reportes maliciosos y datos erróneos), EC-04 (sin consultas N+1), EC-08 (privacidad)
- **Requisitos relacionados:** RF-006, RF-012, RF-013, RF-014; ADR-005, ADR-006

## Contexto

Una auditoría vio que un precio de **$12 por 1 kg de arroz** se aceptó, quedó «Vigente», fue el titular «Más barato» (con «Hasta 100 % menos») y siguió siendo el titular incluso después de que se marcó. El equipo pidió expresamente cerrar el hueco.

Causa raíz:

1. La detección de anómalos (ADR-006, `assessAnomaly`) compara el precio con la mediana de **al menos 3 cuentas distintas** (más las de las tiendas vecinas a 1 km). En producción casi todos los precios son **datos iniciales de la semilla** (`source = siembra`, sin cuenta reportante), así que hay 0 referencias, el resultado es `sin_datos` y el precio se acepta como normal (arranque en frío).
2. Marcar un reporte (RF-013) lo mandaba a la cola de moderación, pero **no cambiaba `comparison.price_current`**: el precio seguía vigente y titular mientras esperaba la decisión.
3. No había ningún piso absoluto: $12 pasa la validación (`priceCop >= 1`).

El frontend agrega una confirmación previa al envío, pero eso se salta con una llamada directa a la API; la defensa que no se puede saltar es la del servidor.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Solo la mediana por cuentas (lo que había) | Simple; ya medida con el conjunto etiquetado | No resuelve el arranque en frío: sin 3 cuentas no evalúa, justo el caso de producción |
| B. Referencia por otras tiendas del municipio (incluidos los datos iniciales) | Usa los datos que sí existen; explicable («otras tiendas cobran ~$1.990»); una consulta | Tiendas muy distintas (descuento vs. barrio) dispersan la mediana; con pocas tiendas no hay referencia |
| C. Referencia mayorista SIPSA | Fuente oficial independiente de nuestras cuentas | Solo productos de peso y con referencia cargada a mano (RF-014); es precio mayorista, no minorista: solo sirve para el lado bajo |
| D. Piso y techo absolutos | Atrapa los errores de ceros sin ninguna referencia; no depende de datos | No atrapa un precio plausible pero erróneo ($700 por un kilo de $2.000) |
| E. Confirmar solo en el cliente | Mejor experiencia: la persona corrige en el momento | Se salta con una llamada directa; no protege a los demás clientes ni a las colas sin conexión |

## Decisión

Se combinan **B, C y D** en el servidor, y E se deja como mejora de experiencia del frontend con los mismos umbrales.

1. **Piso y techo absolutos (D), antes de guardar nada.** Un `priceCop` menor que **$100** o mayor que **$5.000.000** se rechaza con **422** y código estable `IMPLAUSIBLE_PRICE` (mensaje en español, p. ej. «El precio parece incompleto: ningún producto cuesta menos de $100. Revisa si faltan ceros.»). Se evalúa después de buscar la `Idempotency-Key`: el reintento de un reporte ya aceptado sigue recibiendo su recibo original.
2. **Referencia en este orden** (en `assessAnomaly`, función pura; `fallback` solo se usa si no hay 3 cuentas):
   - (a) la actual: mediana de ≥ 3 cuentas distintas (tienda y zona), con la desviación de ADR-006 (40 %);
   - (b) los precios **vigentes** de esa misma presentación y tipo de precio en **otras tiendas del mismo municipio**, datos iniciales incluidos, al menos **3 tiendas distintas**; mediana del precio total;
   - (c) la referencia mayorista **SIPSA** del producto, solo si es de peso y reciente (≤ 30 días, como ya hace la comparación): precio por kilo × kilos de la presentación (con `packCount`); solo el lado bajo;
   - si no hay ninguna, no se evalúa (`sin_datos`) y vale solo el piso absoluto.
3. **Fuera de rango contra (b):** menos del **40 %** o más del **250 %** de la mediana es sospechoso (límite exacto = normal; frente a ADR-006 el rango es más ancho porque las tiendas sí difieren entre sí). **Contra (c):** menos del **50 %** del mayorista.
4. **Sospechoso = camino que ya existía.** Veredicto `sospechoso` con motivo `rango` (la cola lo muestra como `desviacion`, con la mediana y la desviación): el reporte se guarda, queda `en_revision` en `price_current` (no reemplaza a un precio vigente; si la tienda no tiene precio, entra en revisión), sale del orden y de «Más barato», va a la cola del moderador, aparece como «En revisión» en «Mis aportes» y no da ni recibe reputación. Aprobar lo vuelve vigente; descartar lo retira.
5. **Cómo llega la referencia a reliability sin romper ADR-003.** `reliability` no puede importar `comparison` (comparison ya importa reliability: habría un ciclo). `pricing` arma, al recibir el reporte, el contexto `{ peerPricesCop, wholesaleTotalCop }` con consultas públicas de `comparison` (`PeerPrices`, una consulta por reporte), `establishments` y `catalog`, y lo guarda en `PriceReported` v2 como campo **opcional** `plausibility` (sin datos personales). Los eventos anteriores no lo traen y siguen dando `sin_datos`.
6. **Marcar un reporte vigente lo retira del titular.** `FlagReport` publica `PriceFlagged` v1 (sin la clave de nadie) en la misma transacción que la marca; `comparison` pone ese reporte en `en_revision` solo si es el precio mostrado. Si el moderador lo aprueba, `PriceAssessed` (normal) lo devuelve a vigente; si lo descarta, `PriceWithdrawn` lo retira. Si ya había decisión, no se publica el evento (no volvería a la cola).
7. **Contrato.** `POST /v1/reports` responde igual que antes (`201 {id, status: 'recibido', receivedAt}`): el veredicto llega de forma asíncrona (ADR-004) y se lee en `GET /v1/me/reports` (`status: en_revision`). Se agrega solo el 422 `IMPLAUSIBLE_PRICE`.

## Parámetros provisionales

Se declaran en un solo lugar, `PLAUSIBILITY_PARAMS` (`src/domain/price-plausibility.ts`), reemplazables al llamar, como los de ADR-005 y ADR-006. El frontend usa los mismos para su confirmación: deben cambiar juntos.

| Parámetro | Valor | Qué controla |
|---|---|---|
| `minPriceCop` | 100 | Piso absoluto (422) |
| `maxPriceCop` | 5.000.000 | Techo absoluto (422) |
| `lowRatio` / `highRatio` | 0,4 / 2,5 | Sospechoso frente a la mediana de otras tiendas |
| `minPeerStores` | 3 | Tiendas distintas para que sirva su mediana |
| `wholesaleMinRatio` | 0,5 | Sospechoso frente al mayorista SIPSA |

**Cómo se recalibran:** con la cola de moderación real. Cada decisión de «aprobar» sobre un `rango` de arranque en frío es un falso positivo; cada «descartar», un acierto. Cuando haya unas decenas de decisiones se repite la medición (`pnpm reliability:evaluate`, ampliando el conjunto etiquetado con casos de arranque en frío) y se ajustan los valores sin cambiar el código de las reglas. El piso se revisa si aparece un producto legítimo por debajo de $100 (por ejemplo, una unidad suelta): se sube el catálogo a una excepción por categoría, no se baja el piso en general.

## Consecuencias

- Positivas: el caso de la auditoría deja de ser posible (el $12 se rechaza; un $700 queda en revisión y nunca es titular); el arranque en frío tiene referencia con los datos que ya existen; se reutiliza la cola y el estado `en_revision`; un reporte marcado deja de mostrarse mientras se revisa; reglas puras y probadas en los límites exactos (39, 40, 250, 251 %; $99 y $100).
- Negativas / riesgos:
  - **Falsos positivos en ofertas reales:** una promoción de −60 % o más se retrasa hasta que un moderador la apruebe, y recarga la cola. Las ofertas se comparan solo con ofertas, que son pocas.
  - **Fraudes que se ajustan al umbral:** quien conoce el 40 % reporta 41 % y pasa; es el mismo límite conocido de ADR-006 y se complementa con reputación, corroboración y ráfagas.
  - **Un solo marcador puede sacar un precio verdadero del titular** hasta que el moderador decida. Mitigaciones existentes: una marca por cuenta y reporte, solo reportantes verificados (ADR-029) y la cola. Si se abusa, se puede exigir un mínimo de marcas (parámetro nuevo).
  - La referencia por tiendas mezcla formatos distintos; con pocas tiendas o datos iniciales viejos puede sesgarse. Por eso exige 3 tiendas y usa la mediana.
  - La referencia SIPSA es mayorista: no protege el lado alto.
- Trade-offs aceptados: el contexto de referencia es una foto al momento de reportar (guardada en el evento), no se recalcula al reevaluar.

## Verificación

- Dominio: `src/domain/price-plausibility.spec.ts` y `anomaly.spec.ts` (todas las ramas y los límites exactos).
- Caso de uso: `register-report.spec.ts`, `gather-plausibility-context.spec.ts`, `assess-reported-price.spec.ts`, `flag-report.spec.ts`.
- Integración: `test/integration/price-plausibility.spec.ts` (el 422, el atípico en revisión, la cola, «Mis aportes», la idempotencia y el reporte marcado que deja de ser titular).
- Contrato: `docs/openapi.yaml` (422 `IMPLAUSIBLE_PRICE`, estado del recibo y de la marca).
