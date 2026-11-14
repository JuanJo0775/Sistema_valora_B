# Conjunto etiquetado de reportes (issue #67, PR-11)

`labeled-reports.csv` tiene **100 reportes de precio en orden de llegada, 30 de ellos anómalos**. Lo usa `test/integration/reliability-detection.spec.ts` para medir la detección de anómalos de `reliability` (meta de EC-03: 80 % o más). `pnpm reliability:evaluate` imprime la tabla de resultados.

**Es sintético.** Valora todavía no tiene precios reales (la semilla no los trae) y sin etiquetas no se puede medir. Se armó a mano con un patrón fijo para cubrir cada tipo de anomalía de RF-012. Cuando haya datos reales etiquetados, se agregan aquí.

## Columnas

Las de `PriceReported` v2 (`reportId`, `presentationId`, `establishmentId`, `reporterKey`, `reporterSince`, `priceCop`, `priceType`, `observedAt`, `receivedAt`) más la etiqueta:

- `anomalo`: `si` o `no`.
- `tipo`: qué caso representa (tabla de abajo).

Separador `;`. Las claves de reportante son nombres cortos (`h01`, `g00`…): no son cuentas reales.

## Escenario

- **4 presentaciones:** arroz 500 g ($2.500) y aceite 1 L ($9.000), categorías no frescas (TTL de 14 días); huevos ×30 ($15.000) y leche 1,1 L ($4.200), frescas (TTL de 7 días).
- **6 tiendas:** S1, S2 y S3 están a menos de 1 km entre sí; S4 y S5 también; S6 no tiene vecinas. Cada tienda tiene su propio nivel de precios (de −8 % a +12 % sobre el habitual) y cada reporte honesto varía ±3 % sobre ese nivel.
- **Cuentas:** `h…` son reportantes antiguos y honestos; `n…`, cuentas nuevas honestas; las demás letras, las que generan anomalías.

## Tipos

| Tipo                       | Anómalo | Cuántos | Qué representa                                                                                         |
| -------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `honesto`                  | no      | 67      | Precio normal de la tienda, con su variación                                                           |
| `honesto_oferta`           | no      | 2       | Oferta legítima (−18 %) reportada como `oferta`                                                        |
| `honesto_promocion_fuerte` | no      | 1       | Promoción real de −43 % reportada como precio `normal`: un falso positivo esperado                     |
| `aislado_bajo`             | sí      | 10      | Una cuenta reporta entre −50 % y −70 % (competidor que quiere atraer clientes)                         |
| `aislado_alto`             | sí      | 6       | Una cuenta reporta entre +60 % y +120 % (competidor que quiere espantar clientes)                      |
| `coordinado`               | sí      | 8       | Dos grupos de 4 cuentas nuevas con el mismo precio bajo en 15 minutos (escenario de RF-012)            |
| `dificil_espaciado`        | sí      | 3       | Tres cuentas nuevas con el mismo precio falso, separadas más de 60 minutos (límite conocido de la #20) |
| `dificil_borde`            | sí      | 1       | Un precio a −45 %, apenas pasado el umbral del 40 %                                                    |
| `dificil_sin_vecinos`      | sí      | 2       | Precios falsos en S6, sin referencias en la tienda ni en la zona                                       |

Para que haya contra qué comparar, cada presentación empieza con 3 cuentas honestas en S1, S2 y S4, y cada anomalía aislada llega después de un reporte honesto en la misma tienda.

## Cómo se mide

La prueba pasa los 100 reportes, uno por uno, por el caso de uso real (`AssessReportedPrice`) con sus repositorios reales contra `valora_test`. Solo la zona (las tiendas de arriba) y la frescura de cada presentación vienen del conjunto, porque son de otros módulos. **Solo `sospechoso` cuenta como detectado**; un anómalo que sale `sin_datos` cuenta como no detectado. La prueba falla si la detección baja del 80 %.
