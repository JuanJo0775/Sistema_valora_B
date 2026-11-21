# Notas: borrador de precios y productos de D1 (21-nov-2026)

## Cómo se consultó

- `robots.txt` de D1 leído primero. No se visitaron `/busca/`, URLs con `map=`, `initialMap=`, `searchState=`, `sc=`, `OrderBy=`, `/quick-view/`, `/buscapagina/` ni APIs `/api/...`.
- Lista de fichas: el `sitemap.xml` público (lo anuncia el propio `robots.txt`) y sus tres archivos `sitemap/product-*.xml`, unas 2.054 URLs. De ahí se eligieron las fichas a mano.
- **38 fichas de producto** (URLs `/p`) consultadas una por una, con 4 segundos de pausa entre cada una, con un agente de usuario genérico sin datos personales. Más una lectura de control de la ficha del arroz Diana 500 g ($1.990, igual a la fila ya cargada).
- De cada ficha se tomó: nombre, marca, precio y código de barras de los datos de producto que trae la propia página (schema.org `Product`: `gtin` y `offers.price`; y los campos `Price`, `ListPrice` y `PriceWithoutDiscount` de la misma ficha).
- Todos los códigos de barras pasan el dígito de control EAN-13. Control: los de Avena Quaker 400 g y Jamón Cunit 400 g coinciden con los que el catálogo ya tenía de olimpica.com.

## Ofertas

En las 37 fichas con precio, `Price` = `ListPrice` = `PriceWithoutDiscount` y no hay promociones (`teasers` vacío). Ninguna fila es oferta.

## Resultado

- `d1-precios.csv`: 33 filas. 2 de productos que ya estaban en el catálogo (Avena en hojuelas Quaker 400 g y Jamón Cunit 400 g, `exacta`) y 31 de los productos nuevos.
- `d1-productos-nuevos.csv`: 31 presentaciones nuevas.
  - 13 son de marca comercial (`coincidencia = exacta`, salvo la Colgate): 11 son presentaciones nuevas de una marca que ya está en el catálogo (por ejemplo, Sal Refisal 1000 g, Fruco 400 g y 500 g, P.A.N. 800 g, Coca-Cola 1750 ml, Cristal 5 l, Zenú 240 g), y 2 traen marca nueva (La Lechera 320 g y Head & Shoulders 400 ml).
  - 18 son productos genéricos (`marca` vacía) con la marca propia de D1 (Latti, El Estío, Albar, Don Olio, El Refugio, Deliziare, Horneaditos, Brilla King, Bonaropa) o sin una marca fija. La marca va en `fuente` y en `marca_en_web`, y su precio va como `equivalente`.

## Qué no se pudo usar

- **Pan tajado blanco Bimbo 470 g** (`pan-tajado-blanco-bimbo-470-gr-12000028/p`): aparece agotado, con precio 0 y sin código de barras. No hay fila.
- **Jabón Protex 220 g** (`jabon-tocador-protex-220-g-12008823/p`, $6.150): se consultó, pero la ficha no dice si son una barra o dos de 110 g. Se dejó fuera.
- **Pasta para lasaña Deliziare 450 g** ($5.990), **Detergente en polvo Bonaropa 3000 g** ($14.600) y **Coca-Cola 250 ml** ($2.150, código EAN-8): consultados, pero no se agregaron para no pasar mucho de los 25 productos pedidos. Se pueden agregar después.
- No aparecen en el sitemap de productos de D1 (búsqueda por nombre en las URLs): Arroz Diana 1 kg, Arroz Roa, Aceite Premier, Azúcar Manuelita, Atún Van Camp's, leche Colanta y Alquería, detergente Fab y lavaloza Axion. No hay filas para ellos.
- Las fichas de Alpina, Klim y Protex que tiene D1 son de otras presentaciones que las del catálogo, así que no se compararon.
- Salchicha Zenú 240 g quedó en `meat-fish`, fuera de las categorías prioritarias, porque completa una presentación que el catálogo ya tiene en 480 g.

## Dudas para quien revise

1. **Azúcar blanca y azúcar morena:** la ficha da como marca «ELRE/MAYA/ZUKA/RIO» (varias marcas posibles). Se dejaron sin marca y **sin código de barras**, aunque la ficha trae uno, porque no se sabe a cuál de esas marcas pertenece.
2. **Café Sello Rojo 300 g:** la ficha no dice «molido». Se puso en «Café molido» Sello Rojo. Confirmar.
3. **Arveja El Estío 500 g:** la ficha no dice «verde seca». Se puso en «Arveja verde seca».
4. **Crema dental Colgate 100 ml:** es Colgate Triple Acción. Va como `equivalente`, igual que la Colgate Total de 75 ml ya cargada.
5. **Kumis genérico 1000 ml:** D1 lo vende en ml. Es otro producto (otra marca) que el Kumis Alpina en kg, así que no rompe la regla de una sola base por producto. Confirmar que se quiere así.
6. **Mantequilla Latti 200 g:** la ficha no dice si es con sal. Se creó el producto «Mantequilla», distinto de «Mantequilla con sal» Alpina.
7. **Leche entera genérica 900 ml:** es UHT en bolsa. Las leches de Colanta y Alquería del catálogo son de 1100 ml, así que no se compararon.
8. **Productos genéricos con código de barras:** el código es el del empaque de la marca propia de D1. Si el equipo prefiere no ligar un genérico a un código de una sola cadena, basta con borrar la columna en esas filas.
9. **Agua Cristal 5 l:** se escribió en `l` (el producto ya tiene 600 ml). Son la misma base (volumen).
10. Todas las filas llevan `verificar = sí` y `responsable` vacío: deben revisarse antes de sembrar.
