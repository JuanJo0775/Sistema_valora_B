# Revisión antes de firmar (#193)

La semilla ganó en borrador **79 presentaciones**, **167 precios iniciales** y **20 referencias SIPSA**. Todas las filas nuevas tienen `verificar = sí` y `responsable` vacío: **no se cargan** hasta que una persona del equipo las revise y las firme (RF-014 RN5). Para firmar una fila: abrir el CSV en Excel, revisar el dato contra el `url_fuente` o la `fuente`, cambiar `verificar` a `no` y poner el nombre en `responsable`. Después, `pnpm db:seed`.

## Cómo se consiguieron (21-nov-2026)

- **D1** (`notas-d1.md`): 38 fichas de producto (`…/p`) consultadas una por una, con las URL del `sitemap.xml` público. Sin rutas prohibidas por `robots.txt` ni `/api/`.
- **Olímpica** (`notas-olimpica.md`): 160 fichas, igual. Precio por defecto de la página (no se puede elegir ciudad). En 11 fichas había oferta: se tomó el precio normal tachado.
- **SIPSA** (`notas-sipsa.md`): boletín diario de mercados regionales del DANE del 19-nov-2026 (Armenia, Mercar) y del 20-nov-2026 (Pereira, Mercasa).
- Precio y código de barras salen de los datos de la propia ficha (schema.org y estado de la página). **Conviene abrir algunas fichas en el navegador** y confirmar que se ve lo mismo.

## Validación hecha

- `pnpm db:seed` sobre una copia de `seed/` con los borradores marcados como revisados, contra `valora_test`: 0 errores; 150 productos (175 presentaciones), 24 referencias SIPSA y 1757 datos iniciales en tiendas.
- `registro-union.md` lista cada fila que se quitó o cambió al juntar los borradores: repetidos, códigos de barras quitados de productos genéricos y referencias SIPSA sin producto por peso.

## Qué revisar con más cuidado

1. **Códigos de barras genéricos.** A 16 productos sin marca de D1 se les quitó el código de su marca propia: ese código no identifica el producto en otras tiendas.
2. **Coincidencias dudosas de D1:** café Sello Rojo 300 g (la ficha no dice «molido»); arveja El Estío (no dice «verde seca»); Colgate 100 ml (es Triple Acción); mantequilla Latti 200 g (no dice si es con sal); kumis Latti en 1000 ml.
3. **Precios llamativos de Olímpica:** arepa con queso Don Maíz 350 g a 16700 (la ficha dice «x6 unds»: quizá sean 6 paquetes); tilapia Pietran 500 g a 31490; aguacate común más caro que el Hass.
4. **Equivalencias de Olímpica:** fríjol rojo (bolón rojo Olímpica), panela (pulverizada), huevos AA (La Dominga), leche Alquería «original» (¿entera?), papel Familia (¿doble hoja?).
5. **Huevos de codorniz:** la página dice «Agropol» y el catálogo «Agopol».
6. **Equivalencias SIPSA:** «Cebolla junca» → Cebolla junca; «Mora de castilla» → Mora; «Aguacate papelillo» → Aguacate común; «Fríjol cargamanto rojo» → Fríjol rojo; «Azúcar sulfitada» ($2.665/kg en Mercar) → Azúcar blanca (la refinada en Pereira está a $3.545/kg). El precio genérico del boletín se repite en cada marca (arroz, azúcar, arveja, garbanzo).
7. **Sin referencia SIPSA:** plátano hartón (Olímpica lo vende por unidad, no por peso), pollo entero (sin ficha en Olímpica), carne de res molida y azúcar morena (no salen en los boletines de la semana).
8. **Fuera del catálogo por ahora:** Clorox 1,8 l sin precio (su código es un combo en la página; la fila actual de `productos.csv` con ese código está mal); tomate chonto 1 kg en Olímpica ($20000/kg, parece un error de la página); pan Bimbo 470 g (agotado en D1).

## Ideas para después

- `alias` sugeridos para los frescos (por ejemplo, Cebolla junca → Cebolla larga, Cebollín): están en `notas-olimpica.md`. El README describe la columna, pero `productos.csv` no la trae todavía.
- 21 códigos de barras de filas que hoy no tienen, en `notas-olimpica.md`, para llenarlos al verificar.
