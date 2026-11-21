# Olímpica: notas del borrador (21-nov-2026)

Borradores para `seed/precios-iniciales.csv` y `seed/productos.csv`. Ninguna fila está verificada: todas llevan `verificar = sí` y `responsable` vacío.

## Archivos

| Archivo | Filas |
|---|---|
| `olimpica-precios.csv` | 134 precios: 86 de presentaciones que ya están en `productos.csv` y 48 de los productos nuevos |
| `olimpica-productos-nuevos.csv` | 48 productos frescos nuevos: 27 frutas y verduras, 9 carnes y pescados, 5 lácteos y huevos, 7 de panadería |

## Cómo se consultó

- **El navegador no estaba disponible.** La extensión de Chrome no estaba conectada, así que no hubo capturas de pantalla. Cada ficha (`…/p`) se descargó como HTML, de una en una, con una pausa de 2 s. En total fueron 160 fichas.
- **De dónde sale cada dato.** Precio, nombre, marca y código de barras se leyeron de los datos del producto que la ficha trae en su HTML (bloque JSON-LD `Product` y estado de la página: `Price`, `ListPrice`, `ean`). Son los datos con los que la ficha se dibuja. Conviene que alguien abra algunas fichas en el navegador y confirme que se ve lo mismo.
- **Cómo se encontraron las URLs.** Se usó el `sitemap.xml` que el `robots.txt` publica: 51 archivos de lista de URLs, descargados de uno en uno con pausa. Contienen solo direcciones, no precios.
- **Qué no se tocó.** Ninguna URL con `&` o `%`, `?orderFormId=`, `/busca/`, `/quick-view/`, `/account/` ni `/checkout/`, ni APIs internas (`/api/…`).
- **Ciudad.** No se eligió ciudad ni tienda, así que todos los precios son **el precio por defecto de la página**. Así lo dice la columna `nota` de cada fila.
- **Ofertas.** Cuando `Price` era menor que `ListPrice`, se tomó `ListPrice`: el precio normal tachado, que la ficha muestra junto al de oferta. Esto pasó en 11 filas, y cada una lo dice en `nota`. `es_oferta = no` en todas las filas.
- **Fecha.** Todo se consultó el 21-nov-2026.

## Frescos a granel

Las fichas de frutas, verduras y algunas carnes traen dos opciones. Una es **«X KG»** (precio por kilo). La otra es **«X UND»** (precio estimado por pieza) o **«(lb)»** (por libra).

- Para `1 kg` se usó siempre «X KG».
- La única fila por unidad es el plátano hartón verde: `1 und`, a 1667. Es el precio que la página pone a «PLATANO VERDE X UND», y el peso real de cada plátano varía.
- Los precios por libra no se usaron, porque el catálogo no tiene libras.
- La marca de los frescos a granel quedó vacía, porque la página dice «Sin Marca». Las carnes de res empacadas dicen «Mercapollo» en el campo de marca; en el catálogo quedaron sin marca y la marca de la página está en `marca_en_web`.

## Presentaciones existentes sin precio, y por qué

| Presentación del catálogo | Motivo |
|---|---|
| Blanqueador Clorox 1.8 l | Su código (7702213640556) es un **combo**: 1800 ml más Anti Splash de 930 ml, a 12300 normal y 9225 en oferta. No es la misma presentación. **Revisar también la fila de `productos.csv`**: ese código no es el del 1,8 l solo. |
| Tomate chonto 1 kg | La ficha `tomate-chonto/p` dice 20000 por kg y 3140 por unidad. Parece un error de la página, porque el tomate Río Grande está a 8200 por kg. Se omitió. También existe una bolsa de 1,5 kg a 9990 (otra presentación). |
| Aceite de girasol Premier 1000 ml y 3000 ml | No se encontraron esas presentaciones (sí existen 900, 1800 y 2700 ml). |
| Leche entera Colanta 1100 ml | Solo aparecen la semidescremada y la deslactosada. |
| Gaseosa Coca-Cola 400 ml x6 | No se encontró el paquete de 6. |
| Detergente en polvo Fab 1 kg | No se encontró. |
| Queso campesino (sin marca) 500 g | Solo aparecen 450 g (La María) y 1 kg (El Galán). Se agregaron como productos nuevos con su marca. |
| Carne de res molida 500 g | Solo se vende por kg o por libra. Se agregó la presentación de 1 kg en los nuevos. |
| Pechuga de pollo 1 kg | La ficha de Mercapollo (25000) no dice si el precio es por kilo. La de Bucanero trae solo el precio por libra. La de Friko es «x2 unidades», sin peso. |
| Avena, harinas y las demás de marca | Todas tienen precio: no falta ninguna de las 56 que vienen de olimpica.com, salvo Clorox. |

## Otros descartes

- `naranja-p-jugo/p`: el nombre del producto dice «Tomate de Árbol Económico».
- `platano-amarillo/p`: el nombre dice «Res Tortuguita Prim». Son datos cruzados en la página, así que no se usaron.
- `pollo-pernil-bucanero-campesino-kg/p`: 50000 por kg, parece un error.
- `pollo-vacio-country/p` y `cerdo-espinazo`: no dicen si el precio es por kilo o por pieza.
- `pollo-pechuga-bucanero-campesina-granel`: la opción por kilo tiene precio 0.

## Dudas para el equipo

1. **Huevos de codorniz:** la página escribe la marca «Agropol» y el catálogo dice «Agopol». Hay que revisar el empaque.
2. **Precios llamativos:**
   - Arepa con queso Don Maíz 350 g a 16700. La ficha dice «x6 unds».
   - Tilapia Pietran 500 g a 31490.
   - Aguacate común a 14500 por kg, más caro que el Hass a 13200.
   - Papa pastusa: 6900 por kg a granel, pero la bolsa Olímpica de 2,5 kg está a 8450.
   - Chocolate Corona: 200 g a 8290 y 250 g a 8400.
3. **Coincidencias equivalentes** (el catálogo no da la marca o el tipo):
   - Fríjol rojo: bolón rojo Olímpica.
   - Lenteja y panela: Olímpica. La panela es pulverizada.
   - Huevos rojos AA: La Dominga.
   - Papa, cebolla, banano y plátano: a granel.
   - Leche Alquería «original»: no dice si es entera.
   - Papel Familia Acolchamax: no dice si es doble hoja.
   - Colgate: dice «menta».
4. **Gaseosa manzana Postobón Cero 1,5 l:** el código sale en 4 fichas distintas. Se usó `…-1244352/p`.
5. **«Carne de res molida 1 kg»** es una presentación nueva de un producto que ya está en el catálogo (500 g). Hay que decidir si se agrega.
6. **Ya hay otro borrador en esta carpeta:** `d1-productos-nuevos.csv`, de otra consulta. También agrega filas de «Pan tajado blanco» y «Queso campesino». Hay que revisar que no se repitan producto, marca y tamaño al juntar los dos.
7. **Columna `alias`:** el `README` la describe, pero el encabezado de `productos.csv` no la tiene, así que no se agregó. Alias sugeridos:
   - Tomate Río Grande → Tomate ciruelo
   - Cebolla cabezona roja → Cebolla morada
   - Cebolla junca → Cebolla larga, Cebollín
   - Limón Tahití → Limón
   - Limón común → Limón mandarino
   - Aguacate común → Aguacate corriente
   - Naranja Valencia → Naranja
   - Pepino cohombro → Pepino
   - Repollo blanco → Repollo
   - Lechuga Batavia → Lechuga
   - Mojarra descamada → Mojarra
   - Mogolla ocañera → Mogollitas
8. **Códigos de barras de los productos nuevos:** solo se llenaron los EAN-13 válidos que trae la ficha. Los frescos traen códigos internos de 5 a 8 dígitos (por ejemplo 24651370), que no son EAN-13; esa columna quedó vacía.

## Códigos de barras para filas que hoy no tienen

Son de la ficha de Olímpica, y el dígito de control es válido. Se pueden copiar a `productos.csv` al verificar:

| Presentación | Código | Ficha |
|---|---|---|
| Arroz blanco Diana 500 g | 7702511000014 | arroz-diana-500-gr-7702511000014-518231 |
| Arroz blanco Diana 1 kg | 7702511000021 | arroz-diana-1-kg-7702511000021-518232 |
| Arroz blanco Roa 500 g | 7702552000097 | arroz-roa-500-gr |
| Arroz blanco Roa 1 kg | 7702552000141 | arroz-roa-1-kg |
| Aceite de girasol Premier 900 ml | 7701018076416 | aceite-premier-girasol-900ml |
| Azúcar blanca Manuelita 1 kg | 7702406000143 | azucar-manuelita-1-kg |
| Sal refinada Refisal 500 g | 7703812101103 | sal-refisal-500-g |
| Pasta spaghetti Doria 250 g | 7702085012024 | pasta-espaguetti-doria-clasico-250-g |
| Pasta spaghetti Doria 500 g | 7702085013021 | pasta-espaguetti-doria-clasico-500-g |
| Café molido Sello Rojo 250 g | 7702032252190 | cafe-sello-rojo-250-g--costa |
| Chocolate de mesa Corona 250 g | 7702007205046 | chocolate-corona-250-g-cuadro-10 |
| Chocolate de mesa Corona 200 g | 7702007085471 | chocolate-corona-200g |
| Atún en aceite Van Camp's 160 g | 7702367002613 | atun-van-camp-s-aceite-160-g |
| Leche Alquería 1100 ml (original) | 7702177022498 | leche-alqueria-original-1100ml |
| Pan tajado blanco Bimbo 600 g | 7705326468727 | pan-blanco-bimbo-600gr |
| Gaseosa cola Coca-Cola 1500 ml | 7702535024423 | gaseosa-coca-cola-original-1-5l |
| Agua sin gas Cristal 600 ml | 7702090022711 | agua-cristal-pet-600-ml-7702090022711-1060794 |
| Lavaloza en crema Axion 450 g (limón) | 7702010380747 | lava-plato-axion-limon-450g-7702010380747-1245290 |
| Papel higiénico Familia x12 (Acolchamax) | 7702026148331 | papel-higienico-familia-acolchamax-extra-grande-x12-rollos |
| Crema dental Colgate 75 ml (menta) | 7509546652146 | crem-dent-colgate-anticaries-75ml |
| Jabón Protex 110 g x3 (avena) | 7702010920615 | jab-protex-avena-110g-x3 |

Los de Alquería, Familia, Colgate y Protex son de una variedad concreta. Solo valen si el catálogo se refiere a esa misma variedad.

## Fichas consultadas

Todas tienen la forma `https://www.olimpica.com/<ficha>/p`. La lista completa está en la columna `url_fuente` de `olimpica-precios.csv`. Además se consultaron, y se descartaron por los motivos de arriba:

- blanqueador-clorox-original-1-8l-ant-splas-930-p-e-7702213640556-2154076
- tomate-chonto
- tomate-chonto-1-5-kg-20701-2070
- aceite-girasol-premier-line-900-ml-
- panela-olimpica-piloncillo-bsa-500-g
- te-fuze-tea-negra-400-ml-limon-7702535014240-814311
- huevo-aa-rojo-pet-kikes-12un-7707304621360-1353937
- huevo-el-noteno-oj-aa-30un / -12un
- cebolla-cabez-bca-1-kg
- platano-verde-unidad-por-300-gr-7701008659155
- banano-und
- naranja-p-jugo
- platano-amarillo
- cebolla-junca-por-500-gr-7700105000518-2744
- cebolla-larga-la-giralda-al-vacio-por-500g-7701008657267-13533
- papa-criolla-por-1-5-kg-7701008008380
- pollo-vacio-country
- pollo-pechuga-mercapollo-fresca-sin-piel
- pollo-pechuga-bucanero-campesina-granel
- pollo-pernil-bucanero-campesino-kg
- pollo-pechug-fiko-2-und-29509140-3882
- res-costilla-cogote
- cerdo-pernil-pierna-milanesa
- cerdo-espinazo-24010528-67
- arepa-don-maiz-antioqueno-con-sal-8-un-7702417003447-1271516

Las copias HTML de las fichas quedaron en `html/p1` y `html/p2`, por si hay que revisar algo sin volver a consultar la página.
