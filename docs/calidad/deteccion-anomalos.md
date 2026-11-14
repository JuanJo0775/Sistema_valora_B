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

## Límites de la medición

- El conjunto es sintético: mide que las reglas hacen lo que se decidió, no cómo se comporta Valora con usuarios reales.
- Cuando haya reportes reales, se debe etiquetar una muestra y repetir la medición con este mismo comando.
