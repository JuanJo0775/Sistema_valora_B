# Datos de la semilla (`pnpm db:seed`)

Esta carpeta tiene los datos iniciales de Valora (issue #51, RF-014). Los revisa el equipo en Excel y los carga `pnpm db:seed` en la base de `DATABASE_URL`.

| Archivo                 | Qué tiene                                                                         | De dónde sale                                              |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tiendas.csv`           | Tiendas de Armenia con nombre, tipo, dirección y coordenadas                      | OpenStreetMap (una consulta autorizada, 12-nov-2026)       |
| `productos.csv`         | Productos y presentaciones de la canasta                                          | Propuesta de Claude Code que el equipo verifica en tienda  |
| `muestra-exactitud.csv` | Precios que el equipo vio en la tienda, para medir la exactitud (PR-22, opcional) | Visitas del equipo (#93)                                   |
| `sipsa.csv`             | Precios mayoristas por kilo de referencia (opcional)                              | Boletín SIPSA del DANE, copiado a mano por el equipo (#34) |

Ninguno trae precios: los precios llegan con los reportes (paso 5).

## Cómo funciona la carga

- **Solo se cargan las filas verificadas:**
  - tiendas con `revisar = no`;
  - productos con `verificar = no` **y** `responsable` lleno.

  Las demás se saltan, y el comando dice cuántas.

- **Se puede correr las veces que se quiera:** cada fila tiene un id fijo. Si ya existe, se actualiza; no se duplica.
- **Nunca borra.** Si se quita una fila del CSV, el registro se queda en la base y el comando avisa cuántos hay así.
- **Todo o nada:** si una fila verificada tiene un error, **no se carga nada**, y el comando lista cada error con el archivo y la fila. Se corrige el CSV y se vuelve a correr.
- **Cambiar el nombre o la marca de un producto** crea un producto nuevo (el id sale de nombre y marca). El viejo queda en la base y aparece en el aviso.

```bash
pnpm db:seed
```

## Cómo guardar el CSV

- Separador `;`, sin comillas, como «CSV UTF-8» en Excel.
- No usar `;` dentro de un texto.

## `productos.csv`

### Una fila = una presentación

Si un producto se vende en varios tamaños, se repite el producto en varias filas, una por tamaño. Por ejemplo, «Arroz blanco Diana» de 500 g y de 1 kg son dos filas.

| Columna             | Qué va                                                                                                                                                | Ejemplo                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `producto`          | Nombre del producto, sin la marca.                                                                                                                    | `Arroz blanco`                       |
| `marca`             | Marca tal como aparece en el empaque. Vacía para productos a granel o frescos.                                                                        | `Diana`                              |
| `categoria`         | Código de una de las 8 categorías (tabla de abajo).                                                                                                   | `grains-groceries`                   |
| `cantidad`          | Número que dice el empaque, por unidad.                                                                                                               | `500`                                |
| `unidad`            | `g`, `kg`, `ml`, `l` o `und`. Todas las filas de un producto deben compartir la base: peso (`g`, `kg`), volumen (`ml`, `l`) o unidades (`und`) (#59). | `g`                                  |
| `unidades_empaque`  | Cuántas unidades trae el paquete. 1 si se vende suelto.                                                                                               | `6` (en «6 × 400 ml»)                |
| `codigo_barras`     | Los dígitos debajo de las barras del empaque. **Vacío si no lo tienes a la vista.**                                                                   | `7702001023456`                      |
| `alias`             | Opcional. Otros nombres con los que la gente busca el producto, separados por `\|`. Se juntan los de todas las filas del producto (#26).              | `Arroz de mesa\|Arroz blanco`        |
| `imagen_url`        | Opcional. Enlace `https` a la foto del producto (ADR-020, #26). Solo cuenta la primera fila del producto que la trae.                                 | `https://images.openfoodfacts.org/…` |
| `imagen_fuente`     | Con imagen: `open_food_facts` o `equipo`.                                                                                                             | `open_food_facts`                    |
| `imagen_atribucion` | Con imagen: a quién se le reconoce la foto y su licencia.                                                                                             | `Open Food Facts, CC BY-SA`          |
| `verificar`         | `sí` si el tamaño o la marca son dudosos y hay que confirmarlos en tienda.                                                                            | `sí`                                 |
| `fuente`            | De dónde salió el dato. Al verificarlo, cámbiala, por ejemplo a «Visita a tienda».                                                                    | `Visita al D1 de la Carrera 14`      |
| `responsable`       | Quién verificó la fila (RF-014 RN5).                                                                                                                  | `Nombre de quien revisó`             |
| `fecha`             | Fecha de la verificación (AAAA-MM-DD).                                                                                                                | `2026-11-12`                         |

### Categorías

| Código               | Categoría          | ¿Fresca? |
| -------------------- | ------------------ | -------- |
| `fruits-vegetables`  | Frutas y verduras  | sí       |
| `meat-fish`          | Carnes y pescados  | sí       |
| `dairy-eggs`         | Lácteos y huevos   | sí       |
| `bakery`             | Panadería          | sí       |
| `grains-groceries`   | Granos y abarrotes | no       |
| `beverages`          | Bebidas            | no       |
| `household-cleaning` | Aseo del hogar     | no       |
| `personal-care`      | Cuidado personal   | no       |

### Por qué los códigos de barras están vacíos

No se inventan: un código falso podría coincidir con otro producto real. Se copian del empaque al verificar en la tienda. Al sembrar, cada código se revisa con su dígito de control (EAN-13), y uno mal escrito se rechaza con un mensaje que dice en qué fila está.

### Fotos de Open Food Facts (`pnpm seed:imagenes`, #119)

Cuando una fila tiene `codigo_barras`, este comando busca la foto frontal del producto en [Open Food Facts](https://world.openfoodfacts.org) (ADR-020) y la escribe en `productos.csv`:

```bash
pnpm seed:imagenes
```

- Llena `imagen_url` (solo el **enlace**: la foto no se descarga), `imagen_fuente = open_food_facts` e `imagen_atribucion = Open Food Facts, CC BY-SA`. Si faltan esas columnas, las agrega al final; el resto del archivo queda igual.
- **No reemplaza** una imagen ya cargada (del equipo o de Open Food Facts), aunque esté en otra fila del mismo producto. Un producto toma una sola foto: la de su primera presentación que la tenga.
- Escribe el archivo solo si encontró alguna foto, y al final dice cuántos consultó, cuáles quedaron con foto y cuáles **revisar a mano** (sin foto, que Open Food Facts no conoce o que no se pudieron consultar).
- Consulta con un nombre genérico del proyecto, sin correo ni datos de nadie, y con una pausa entre consultas (Open Food Facts pide no pasar de 100 por minuto). No usa la base ni corre en el servidor. Nunca toma fotos de sitios de cadenas.
- Después se revisa el CSV y se corre `pnpm db:seed` para cargarlas.

Hoy la semilla no tiene códigos de barras (los llena el equipo, #118), así que el comando dice «0 productos con código de barras y sin imagen».

### Qué revisar en la tienda

1. Las filas con `verificar = sí`: el tamaño exacto (por ejemplo, si la leche en bolsa trae 1100 ml) y que la marca exista con ese producto.
2. Agregar o quitar productos: la canasta debe ser la que el equipo use en las pruebas con usuarios.
3. Llenar `codigo_barras`, `responsable` y `fecha`, y cambiar `fuente`.

## `sipsa.csv` (referencia mayorista, #34)

SIPSA es el sistema del DANE que publica **precios mayoristas** de alimentos en las centrales de abasto, en pesos por kilo. En Valora es **solo una referencia**: se muestra aparte en la comparación y **nunca** como precio de una tienda (RF-014 RN3). Se copia a mano desde el boletín; no se descarga de forma automática (ADR-011).

| Columna                          | Qué va                                                                                                                       | Ejemplo                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `producto` y `marca`             | Igual que en `productos.csv`, para saber de qué producto es. El producto debe estar verificado y venderse por peso (g o kg). | `Arroz de prueba` y `Marca de prueba` |
| `producto_sipsa`                 | El nombre tal como aparece en el boletín.                                                                                    | `Arroz blanco importado`              |
| `mercado`                        | La central de abasto del boletín.                                                                                            | `Armenia, Mercar`                     |
| `inicio_periodo` y `fin_periodo` | Las fechas del boletín (AAAA-MM-DD).                                                                                         | `2026-11-09` y `2026-11-15`           |
| `precio_kg`                      | El precio medio por kilo, en pesos, sin puntos.                                                                              | `3200`                                |
| `url_fuente`                     | El enlace `https` del boletín.                                                                                               | `https://www.dane.gov.co/…`           |
| `verificar`                      | `no` cuando alguien del equipo revisó la fila.                                                                               | `no`                                  |
| `responsable` y `fecha_consulta` | Quién la copió y cuándo (RF-014 RN5).                                                                                        | `Nombre` y `2026-11-15`               |

- La comparación solo la muestra si el periodo terminó hace 30 días o menos.
- Un producto en ml o unidades no es comparable con un precio por kilo: la fila se rechaza.
- Volver a cargar la misma fila (producto, mercado e inicio del periodo) la actualiza; no la duplica.

### Cómo se actualiza cada semana (decidido el 15-nov-2026)

Fuente: el ZIP **«Informes por ciudades»** de la página de SIPSA (<https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas>), que trae un PDF por mercado. El anexo diario en Excel **no** trae Armenia.

1. Una vez por semana, descargar el ZIP del último día hábil (`bol-SIPSADiario-regionales-DDmesAAAA.zip`). El del sábado solo trae Bogotá.
2. Buscar cada producto en el PDF **«Armenia, Retiro»**. Si no aparece, usar **«Pereira, Mercasa»** como respaldo; el mercado queda escrito en la fila y la comparación lo muestra.
3. Si no aparece en ninguno de los dos, probar el día hábil anterior. Si no salió en toda la semana, esa semana el producto no lleva fila.
4. **Precio por kilo:** el punto medio entre mínimo y máximo. Si viene por bulto, bolsa o arroba, dividir por los kilos que dice el informe (por ejemplo, cebolla: bulto de 50 kg entre $100.000 y $112.000 → $106.000 ÷ 50 = $2.120).
5. Una fila por producto, con la fecha del informe en `inicio_periodo` y `fin_periodo`, el enlace del ZIP en `url_fuente`, el nombre de quien la copió en `responsable` y `verificar = no`.
6. Correr `pnpm db:seed`. La referencia se deja de mostrar a los 30 días.

Equivalencias usadas: «Banano criollo» → Banano; «Cebolla cabezona blanca» → Cebolla cabezona; «Tomate chonto» → Tomate chonto; «Papa parda pastusa» → Papa pastusa.

Las filas solo se cargan cuando el producto también está verificado en `productos.csv` (con responsable). Si no, la semilla dice qué fila corregir.

## `muestra-exactitud.csv` (PR-22, #93)

No se carga a la base: sirve para medir qué tan exactos son los precios que publica Valora. El equipo anota lo que ve en la tienda y `pnpm quality:accuracy` lo compara con el precio vigente de Valora para esa presentación en esa tienda. El resultado queda en `docs/calidad/exactitud-pr22.md`.

| Columna                                                       | Qué va                                                           | Ejemplo                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `osm_id`                                                      | El `osm_id` de la tienda en `tiendas.csv`.                       | `node/123456`                                         |
| `producto`, `marca`, `cantidad`, `unidad`, `unidades_empaque` | Igual que en `productos.csv`, para saber de qué presentación es. | `Arroz de prueba`, `Marca de prueba`, `500`, `g`, `1` |
| `precio`                                                      | El precio que se vio, en pesos, sin puntos.                      | `2500`                                                |
| `fecha`                                                       | El día que se vio (AAAA-MM-DD).                                  | `2026-11-14`                                          |
| `responsable`                                                 | Quién lo vio.                                                    | `Nombre`                                              |

- Si una fila tiene un error, no se genera el informe y el comando dice qué fila corregir.
- Para que haya con qué comparar, alguien debe haber reportado un precio de esa presentación en esa tienda en Valora.

## `tiendas.csv`

### De dónde sale

- **Una sola consulta** a OpenStreetMap (Overpass API), autorizada por la integrante que dirige el backend. Datos del 12 de noviembre de 2026 (hora UTC).
- **Zona:** el límite oficial del municipio de Armenia (relación OSM 1343039).
- **Tipos de comercio:** `supermarket`, `convenience`, `general`, `greengrocer`, `butcher` y `bakery`.
- **Resultado:** 384 comercios.
- **Fuente obligatoria en cada fila:** «© colaboradores de OpenStreetMap, ODbL». La aplicación también debe mostrar esa atribución (ADR-019).
- **Trae solo tiendas** (nombre, tipo, ubicación y, a veces, dirección): **ni productos ni precios**.
- **No se repite automáticamente** (RF-014 RN4). Las tiendas nuevas llegan por sugerencia de la comunidad, con moderación (RF-005 RN7).

### Criterios aplicados

| Paso                                     | Criterio                                                                                                                                                                                                                                                                 | Resultado                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Tipo en Valora                           | D1 y Ara (por marca o por nombre) → `descuento`; `supermarket` → `supermercado`; `convenience` → `minimercado`; `general`, `greengrocer` (frutería) y `butcher` (carnicería) → `barrio`                                                                                  | —                                            |
| Fuera                                    | Panaderías (muchas son cafeterías) y comercios sin nombre                                                                                                                                                                                                                | quedan 222                                   |
| Limpieza por nombre                      | Se quitaron 11 tiendas `general` que claramente no venden comida: baterías, cacharrería, centro naturista, químicos, artículos de fiesta, forros de celular, motos, accesorios, una sede administrativa de la empresa de energía, un club de fumadores y venta de cartón | quedan **211**                               |
| Confirmadas por nombre                   | 11 tiendas `general` cuyo nombre dice que son tienda de barrio o de comida («Tienda…», «Ventanilla…», «Víveres», «Huevos…», «Market») pasaron a `revisar = no`                                                                                                           | —                                            |
| Repetidas                                | Los nombres repetidos que no son cadenas están a más de 800 m entre sí: son sucursales distintas, no la misma tienda dos veces (criterio de 50 m de RF-005 RN3)                                                                                                          | ninguna fusión                               |
| Revisión manual del equipo (11-nov-2026) | Se quitaron 27 tiendas más, sin cambiar las demás                                                                                                                                                                                                                        | quedan **184** (158 listas y 26 por revisar) |

### Qué falta (el equipo)

1. **Las 26 filas con `revisar = sí`** son tiendas `general` con nombres que no dicen qué venden («Casa Blanca», «La 72», «Misceláneas», «Variedades»…). Hay que confirmar que venden productos de la canasta. Si no, se borra la fila.
2. **Tiendas cerradas o que se mudaron:** OpenStreetMap puede estar desactualizado. Basta con revisar las que el equipo conozca.
3. **Tipo:** si una tienda quedó con un tipo que no le corresponde (por ejemplo, un minimercado marcado como `barrio`), se cambia la columna `tipo`.
4. **No cambiar** `osm_id`, `lat`, `lng`, `fuente` ni `fecha_consulta`: son la trazabilidad del dato.
