# Notas del borrador `sipsa-nuevas.csv` (consulta del 2026-11-21)

Borrador para revisión del equipo: las 22 filas llevan `verificar = sí` y `responsable` vacío. La semilla solo carga una fila cuando `verificar = no` y tiene responsable.

## Boletines usados

| Fecha | URL | Qué trae | Mercados usados |
|---|---|---|---|
| 2026-11-19 (jueves) | https://www.dane.gov.co/files/operaciones/SIPSA/bol-SIPSADiario-regionales-19nov2026.zip | ZIP que contiene un `.rar` con un PDF por mercado | **Armenia, Mercar** (fuente principal) |
| 2026-11-20 (viernes) | https://www.dane.gov.co/files/operaciones/SIPSA/bol-SIPSADiario-regionales-20nov2026.zip | Aunque termina en `.zip`, el archivo es un **RAR** (se abre con `tar.exe` de Windows) | Pereira, Mercasa (respaldo) |

Copias locales: `semilla/sipsa-boletin/` (archivos descargados y los PDF de Armenia y Pereira ya extraídos).

Por qué estas fechas:

- El 2026-11-21 (sábado) también responde, pero según el README el del sábado solo trae Bogotá. No lo abrí.
- El 2026-11-20 es el más reciente con regionales, pero **Armenia, Retiro** solo trae 8 productos ese día (limón mandarino, mandarina, naranja sweet, banano criollo, plátano dominico hartón verde, plátano hartón verde, yuca ica, chócolo).
- **Armenia, Mercar** solo sale el martes y el jueves (17 y 19 de noviembre). El del 19 es el más reciente y trae frutas, verduras, granos, procesados, lácteos, pollo y pescado. Por eso es la fuente principal.
- El del 16-nov respondió con una página HTML, no con un archivo. Lo borré.

## Cómo se calculó `precio_kg`

Como dice el README: punto medio entre mínimo y máximo de la Ronda 1 (la Ronda 2 sale en 0 en todos los boletines), dividido por los kilos que **dice el boletín**, redondeado al peso entero más cercano.

| Fila | Presentación en el boletín | Mín – Máx | Cálculo | precio_kg |
|---|---|---|---|---|
| Arroz blanco (Diana y Roa) | Bolsa 25 unidades de 500 g = 12,5 kg | 44.200 – 45.100 | 44.650 ÷ 12,5 | 3572 |
| Fríjol rojo | Bolsa 25 unidades de 454 g = 11,35 kg | 132.000 – 134.500 | 133.250 ÷ 11,35 | 11740 |
| Lenteja | Bolsa 25 unidades de 454 g = 11,35 kg | 44.600 – 45.000 | 44.800 ÷ 11,35 | 3947 |
| Arveja verde seca | Bolsa 25 unidades de 454 g = 11,35 kg | 53.500 – 55.000 | 54.250 ÷ 11,35 | 4780 |
| Garbanzo | Bolsa de 454 g | 3.000 – 3.300 | 3.150 ÷ 0,454 | 6938 |
| Azúcar blanca (Incauca y Manuelita) | Bulto 50 kg | 132.000 – 134.500 | 133.250 ÷ 50 | 2665 |
| Panela | Bolsa 24 kg | 127.000 – 130.000 | 128.500 ÷ 24 | 5354 |
| Queso campesino | Kilogramo | 24.000 – 25.000 | 24.500 | 24500 |
| Pechuga de pollo | Libra 500 g | 9.000 – 9.000 | 9.000 ÷ 0,5 | 18000 |
| Pollo entero | Libra 500 g | 9.000 – 9.000 | 9.000 ÷ 0,5 | 18000 |
| Tomate chonto | Canastilla 22 kg | 80.000 – 82.000 | 81.000 ÷ 22 | 3682 |
| Cebolla larga | Atado/manojo 14 kg | 38.000 – 40.000 | 39.000 ÷ 14 | 2786 |
| Plátano hartón | Kilogramo | 2.300 – 2.400 | 2.350 | 2350 |
| Papa criolla | Bulto 60 kg | 220.000 – 230.000 | 225.000 ÷ 60 | 3750 |
| Zanahoria | Bulto 60 kg | 100.000 – 105.000 | 102.500 ÷ 60 | 1708 |
| Limón tahití | Kilogramo | 1.400 – 1.500 | 1.450 | 1450 |
| Mango tommy | Canastilla 30 kg | 150.000 – 152.000 | 151.000 ÷ 30 | 5033 |
| Mora de castilla | Kilogramo | 7.800 – 8.000 | 7.900 | 7900 |
| Aguacate (Pereira, 20-nov) | Kilogramo | 13.000 – 13.000 | 13.000 | 13000 |
| Naranja valencia (Pereira, 20-nov) | Kilogramo | 1.800 – 2.000 | 1.900 | 1900 |

Todas las filas son de Armenia, Mercar del 19-nov, salvo Aguacate y Naranja valencia (Pereira, Mercasa del 20-nov), que no aparecen en Mercar.

## Equivalencias que el equipo debe confirmar

- **Cebolla larga ← «Cebolla junca»**: es el nombre que usa SIPSA para la cebolla larga.
- **Plátano hartón ← «Plátano hartón verde»** (2.300 – 2.400). El mismo boletín trae «Plátano hartón maduro» a 2.000 – 2.100 ($2.050/kg) por si se prefiere.
- **Aguacate ← «Aguacate papelillo»**: es la única variedad de aguacate en los boletines de Armenia y Pereira de esta semana.
- **Zanahoria ← «Zanahoria»** (Mercar; en Pereira se llama «Zanahoria bogotana»).
- **Fríjol rojo ← «Fríjol cargamanto rojo»**. Mercar también trae «Fríjol bolón» y «Fríjol nima calima»; el cargamanto rojo es el que más se parece a «Fríjol rojo».
- **Azúcar blanca ← «Azúcar sulfitada»** (Mercar). Duda: en Pereira, Mercasa del 19-nov aparece «Azúcar refinada» por kilogramo a 3.290 – 3.800 ($3.545/kg). Elegí la de Armenia por la regla de prioridad; si el equipo considera que «Azúcar blanca» equivale a la refinada, cambiar la fila.
- **Productos con marca** (Arroz blanco Diana y Roa, Azúcar blanca Incauca y Manuelita, Arveja verde seca y Garbanzo Olímpica): el boletín da un precio **genérico**, sin marca. La misma referencia queda repetida en cada marca. Decidir si se quiere así.
- **Tomate chonto** ya tiene fila en `sipsa.csv` (Pereira, 13-nov). La nueva fila tiene otro mercado y otro periodo, así que se agrega como referencia nueva; cuando se mezcle, conviene quitar la vieja o dejar que venza (30 días).

## Productos sin fila y por qué

- **Carne de res molida**: ningún boletín de Armenia o Pereira de la semana trae carne molida. Solo «Pereira, La 41-Impala» (17-nov) trae cortes de res (bola, cadera, etc., entre $26.000 y $45.000/kg); usar un corte sería inventar la equivalencia. Omitida.
- **Azúcar morena (Riopaila)**: no aparece azúcar morena en Armenia ni en Pereira. Omitida.
- **Productos procesados de marca** (harina de trigo, harina de maíz precocida, avena, café molido, pastas, sal, chocolate, atún, mayonesa, salsa de tomate, leche en polvo): Mercar sí trae líneas genéricas de estos productos con el peso del empaque, pero son precios de caja o bolsa de distribuidor sin marca y no están en la lista pedida. No los incluí; si el equipo los quiere, el boletín del 19-nov de Mercar tiene los datos.
- **Otros del catálogo por peso** (arepas, pan, jamón, salchichas, mantequilla, yogur, kumis, crema de leche, detergentes, jabones, crema dental, desodorante, lavaloza, arvejas en lata, leche condensada, queso mozzarella, café instantáneo, avena líquida): no aparecen en SIPSA.
- **Banano, Cebolla cabezona, Papa pastusa**: ya tienen fila en `sipsa.csv`; no se pidieron. Si se quiere refrescarlas, Mercar 19-nov trae «Banano criollo» 1.200 – 1.300/kg, «Cebolla cabezona blanca» bulto 50 kg a 110.000 – 115.000 y «Papa parda pastusa» bulto 50 kg a 160.000 – 165.000.

## Observaciones sobre el proceso

- El README dice que se busque en «Armenia, Retiro», pero el 17 y el 19 el ZIP trae **«Armenia, Mercar»** (mucho más completo) y el 18 y el 20 trae «Armenia, Retiro». Conviene actualizar la sección «Cómo se actualiza cada semana» del README para mencionar Mercar (martes y jueves).
- Los archivos del DANE no siempre son ZIP: el del 20-nov es un RAR con extensión `.zip` y el del 19-nov es un ZIP que contiene un RAR. En Windows, `tar.exe` (de `C:\Windows\System32`) los abre.
- El texto de los PDF se leyó con `pdftotext -raw`; el modo `-layout` desordena las columnas del PDF de Pereira y no sirve para copiar precios.
