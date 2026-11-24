# Evidencia del piloto VTEX de Olímpica

## Consulta del 23 de noviembre de 2026, hora de Colombia

El endpoint de regiones de VTEX respondió HTTP 200 para `country=COL&postalCode=630001`. Devolvió una región con los vendedores `olimpicaswl1091meli` y `olimpicaswl1092addi`. La simulación para el SKU 516338 (Arroz Roa 500 g) devolvió el código postal y el vendedor solicitados, estado `withoutStock` y ningún precio de venta para ambos vendedores.

El comando interno consultó cinco EAN del catálogo con el primer vendedor. Resultado:

| EAN | Resultado |
| --- | --- |
| 7702552000097 | Sin stock confirmado |
| 7702511000014 | Sin stock confirmado |
| 7701018007151 | Fallo individual de consulta |
| 7702085013021 | Sin stock confirmado |
| 7705326468727 | Sin stock confirmado |

La consulta general de catálogo había devuelto $1.950 para Arroz Roa 500 g. Se usa el catálogo externo para ubicar el SKU y la simulación para obtener disponibilidad y precio por zona. El piloto aún requiere una oferta disponible en la zona y contrastarla con la web de Olímpica antes de considerar un precio regional validado.

Referencias: [regiones y vendedores](https://developers.vtex.com/docs/guides/get-sellers-by-region-or-address) y [simulación de Checkout](https://developers.vtex.com/docs/api-reference/checkout-api).

## Reproducir

Configurar `OLIMPICA_VTEX_POSTAL_CODE`, `OLIMPICA_VTEX_REGION_ID`, `OLIMPICA_VTEX_SELLER_ID` y `OLIMPICA_VTEX_EANS` (5 a 10 EAN separados por comas) en el entorno del backend. Ejecutar `pnpm olympica:vtex`. El comando se conecta a la base para leer el catálogo y devuelve JSON. La persistencia corresponde a la #239.

## Simulación en el centro de Armenia del 24 de noviembre de 2026

La vista previa con el punto público del centro y el vendedor principal de Olímpica devolvió cuatro ofertas con entrega disponible:

| Presentación | EAN | Precio COP |
| --- | --- | ---: |
| Arroz Roa 500 g | 7702552000097 | 2200 |
| Arroz Diana 500 g | 7702511000014 | 2100 |
| Pasta Doria 500 g | 7702085013021 | 4500 |
| Pan Bimbo 600 g | 7705326468727 | 6312 |

El aceite Premier 1000 ml (7701018007151) falló por separado. El Arroz Roa coincidió con los $2.200 observados en el carrito de Olímpica. Los otros tres importes todavía se deben contrastar con la web. La respuesta de Checkout devuelve una opción de domicilio para el punto solicitado; el código de zona es un identificador interno de Valora.

Para reproducir en PowerShell con la base local disponible:

```powershell
$env:OLIMPICA_VTEX_LOCATION='armenia-centro'
$env:OLIMPICA_VTEX_EANS='7702552000097,7702511000014,7701018007151,7702085013021,7705326468727'
pnpm olympica:vtex
```
