# Detección de precios anómalos — medición con el conjunto etiquetado

- **Escenario de calidad:** EC-03 (detección mínima de anomalías del 80 % sobre un conjunto etiquetado, aprobado; el umbral de desviación del 40 % es provisional).
- **Requisitos:** RF-011, RF-012 (RN1, RN3, RN5), PR-11.
- **Issue:** #67 (segunda parte de la #31). Fecha: 14 de noviembre de 2026.
- **Cómo reproducirlo:** `corepack pnpm reliability:evaluate` (necesita `valora_test` migrada).
- **Conjunto:** `test/fixtures/reliability/labeled-reports.csv`, sintético y documentado en su `README.md`: 100 reportes, 30 anómalos.

## Resultado final

| Tipo | Anómalo | Reportes | Sospechoso | Por coordinación | Normal | Sin datos |
|---|---|---|---|---|---|---|
| honesto | no | 67 | 0 | 0 | 43 | 24 |
| honesto_oferta | no | 2 | 0 | 0 | 0 | 2 |
| honesto_promocion_fuerte | no | 1 | 1 | 0 | 0 | 0 |
| aislado_bajo | sí | 10 | 10 | 0 | 0 | 0 |
| aislado_alto | sí | 6 | 6 | 0 | 0 | 0 |
| coordinado | sí | 8 | 8 | 4 | 0 | 0 |
| dificil_espaciado | sí | 3 | 3 | 0 | 0 | 0 |
| dificil_borde | sí | 1 | 1 | 0 | 0 | 0 |
| dificil_sin_vecinos | sí | 2 | 0 | 0 | 0 | 2 |

- **Detección: 28 de 30 (93 %).** Cumple la meta del 80 % de EC-03.
- **Falsos positivos: 1 de 70 honestos (1 %).** Es el caso esperado: una promoción real de −43 % reportada como precio `normal`. No hay un máximo aprobado para los falsos positivos; se registran, como pide RF-012 RN5.

## Calibración (ADR-005)

| Medición | Detección | Falsos positivos | Qué cambió |
|---|---|---|---|
| Primera | 28 de 30 (93 %) | 2 de 70 | — |
| Final | 28 de 30 (93 %) | 1 de 70 | Los reportes en revisión de la tienda forman grupo, pero ya no entran a la mediana |

**Por qué cambió:** en la primera medición, un precio honesto de aceite ($9.800) salió sospechoso frente a una «mediana» de $3.900. En esa tienda había habido un ataque coordinado (4 cuentas a $2.500) y un precio aislado de $3.600. Como los sospechosos de la tienda seguían contando (para no romper la detección de grupos, ajuste de la #31), el ataque movió la mediana y luego hizo ver anómalo a un precio verdadero. Se separó: los reportes en revisión cuentan para formar un grupo, pero nunca para la mediana (`flagged` en `assessAnomaly`, con su ciclo TDD). Los valores provisionales (40 %, 3 cuentas, 60 minutos, 7 días, 1 km) **no se cambiaron**.

## Lo que no se detecta

- **Tiendas sin vecinas ni historia (2 de 30):** sin 3 cuentas de referencia en la tienda ni en la zona, la regla responde `sin_datos` y no marca (decisión 4 de la #20). Es el costo de no marcar con pocos datos.
- **Grupos espaciados:** en este conjunto se detectaron por rango (había suficientes referencias honestas), pero no por coordinación. Si un grupo así llega antes que los precios honestos, puede pasar. Sigue siendo el límite conocido de la #20.

## Lo que muestra sobre los datos honestos

- **24 de 67 honestos quedaron `sin_datos`:** al principio de cada tienda y presentación no hay con qué comparar. No es un error, pero muestra que la detección mejora con el volumen de reportes, y que conviene sembrar precios de referencia cuando existan (SIPSA, #34).
- **Ofertas:** las 2 ofertas honestas quedaron `sin_datos` porque se comparan solo con otras ofertas, que son pocas.


## Arranque en frío y plausibilidad (ADR-030, 17 de noviembre de 2026)

Una auditoría vio que $12 por 1 kg de arroz se aceptó, fue vigente y titular «Más barato». Con datos iniciales de la semilla (sin cuenta reportante) no hay 3 cuentas de referencia, así que la regla de arriba respondía `sin_datos` y no marcaba nada. Comportamiento nuevo, en este orden:

1. **Piso y techo absolutos:** menos de $100 o más de $5.000.000 se rechaza con 422 `IMPLAUSIBLE_PRICE` antes de guardar nada.
2. **Referencia por cuentas** (la de arriba, ≥ 3 cuentas, desviación de 40 %).
3. **Si no alcanza, otras tiendas:** la mediana del precio vigente de esa presentación en otras tiendas del mismo municipio (datos iniciales incluidos, al menos 3 tiendas). Menos del 40 % o más del 250 % de la mediana es sospechoso; el límite exacto es normal.
4. **Si tampoco hay, SIPSA:** menos del 50 % del precio mayorista del mismo peso (precio por kilo por los kilos de la presentación, con el empaque) es sospechoso. Solo productos de peso y con referencia de 30 días o menos.
5. **Sin ninguna referencia:** `sin_datos`; solo vale el piso.

Un sospechoso por (3) o (4) usa el camino de siempre: queda `en_revision`, no reemplaza el precio vigente, no entra al orden ni a «Más barato», va a la cola del moderador (motivo `desviacion`, con la mediana de referencia) y a su autor le aparece «En revisión» en «Mis aportes». El resultado guarda de dónde salió la referencia (`reference: 'tiendas' | 'sipsa'`; las cuentas no llevan el campo).

**Reporte marcado:** cuando una cuenta marca un reporte que es el precio vigente de su tienda, comparison lo pone `en_revision` (evento `PriceFlagged`) hasta que el moderador decida: aprobar lo devuelve a vigente, descartar lo retira. Antes seguía siendo titular durante la espera.

Los parámetros (`PLAUSIBILITY_PARAMS`) son provisionales y se recalibran con la cola real; este conjunto etiquetado todavía no incluye casos de arranque en frío (pendiente de ampliar). Ver [ADR-030](../adr/0030-plausibilidad-de-precios.md).

## Precio oficial del comercio (ADR-037, 24 de noviembre de 2026)

La prueba de usuario del módulo comercial (hallazgo H19) mostró que el precio oficial se saltaba esta detección: $300 por 1 kg de arroz quedó oficial, vigente y titular «Más barato», y $52.000 también se aceptó. Ahora el precio oficial (`PUT /v1/commerce/prices`, la carga CSV y el precio resultante de una promoción) pasa por la misma referencia y los mismos parámetros que un reporte (puntos 3 y 4 de arriba: la mediana de al menos 3 tiendas del municipio y, si no, el mayorista SIPSA), con tres resultados:

1. **Dentro de rango:** se publica como oficial vigente.
2. **Claramente fuera de rango** (menos del 40 % o más del 250 % de la mediana; menos del 50 % del mayorista): 422 `IMPLAUSIBLE_OFFICIAL_PRICE` con el rango de referencia en el mensaje; no se guarda nada. En una promoción solo se vigila el lado bajo.
3. **Sin referencia:** se acepta «en revisión»: no es oficial ni titular, no sale en la comparación y entra a la cola de moderación con el motivo `sin_referencia` (no hay mediana ni desviación). Aprobar lo publica como oficial vigente; descartar lo retira.

Diferencia con un reporte: un reporte sospechoso entra «en revisión» y un oficial fuera de rango se rechaza, porque el oficial lo escribe una cuenta verificada que puede corregirlo al instante y porque la marca «oficial» pesa más (ADR-008). El medidor `pnpm reliability:evaluate` sigue midiendo reportes de la comunidad; los casos de precio oficial anómalo todavía no están en el conjunto etiquetado (pendiente de ampliar), y las reglas puras se prueban en `src/domain/price-plausibility.spec.ts`. Ver [ADR-037](../adr/0037-plausibilidad-del-precio-oficial.md).

## Límites de la medición

- El conjunto es sintético: mide que las reglas hacen lo que se decidió, no cómo se comporta Valora con usuarios reales.
- Cuando haya reportes reales, se debe etiquetar una muestra y repetir la medición con este mismo comando.
