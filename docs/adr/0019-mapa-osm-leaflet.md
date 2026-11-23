# ADR-019: Mapa de establecimientos: OpenStreetMap con Leaflet

- **Estado:** Aceptado
- **Fecha:** 2026-11-16
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-04, EC-08
- **Requisitos relacionados:** RF-005 (establecimientos) y otros dos RF de Notion aún sin numerar en este repositorio
- **Corte / Área / Preguntas de diseño (Notion):** Corte 2 / Datos / P5 Datos iniciales, P6 Comercio pequeño
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/41539c4a833b80d29af0c2c2bc244a9b)

Fuente: Notion, base ADRs, página 41539c4a833b80d29af0c2c2bc244a9b; estado copiado de Notion.

> El texto de las secciones Contexto a Consecuencias está copiado de las propiedades de texto de la fila; el cuerpo de la página de Notion se copia al final, tal cual (con sus títulos bajados un nivel). Los saltos `<br />` de las propiedades se muestran como párrafos.

## Nota de registro

Resuelto el 23-nov-2026:

- **Estado.** Aceptado el 16-nov-2026 (frontend #18), como dice el texto de la decisión y la sección «Aceptación» del cuerpo.
- **Un solo tema.** ADR-019 es el mapa (OpenStreetMap con Leaflet). Las menciones de `docs/DECISIONS.md` y de las issues #13, #50 y #51 se refieren a este mismo ADR: los tipos de establecimiento coloreados en el mapa (barrio, minimercado, supermercado y descuento), el radio de 0,5 a 3 km y la atribución de OpenStreetMap. No existe en el repositorio un segundo ADR-019; no se renumera (023 a 028 están reservados para AS-E4). Si Notion tiene una fila duplicada con este ID, se elimina en Notion y queda esta.
- **Fecha en ADR-003.** ADR-003 cita este ADR con «10 de noviembre» (cuando se propuso); la decisión es del 16-nov-2026.

## Contexto

El consumidor quiere ver en un mapa qué tiendas registradas en Valora tiene cerca y decidir a cuál ir. RF-005 ya define el directorio con coordenadas, la consulta por cercanía (GET /v1/establishments/nearby) y la sugerencia de tiendas nuevas, y ADR-003 guarda las ubicaciones en PostGIS. Falta decidir con qué proveedor se dibuja el mapa y qué se puede hacer con datos de terceros. Restricciones: costo cero para un proyecto académico, no exponer ni guardar la ubicación del usuario (EC-08), y muchas tiendas de barrio no aparecen en Google ni en OpenStreetMap.

## Alternativas consideradas

A) Google Maps (Maps JavaScript API y Places API): mapa conocido y búsqueda de lugares. Gratis solo hasta un tope mensual por servicio (desde marzo de 2025 ya no hay crédito de USD 200); sus términos prohíben mostrar datos de Places sobre un mapa que no sea de Google y solo permiten guardar latitud y longitud en caché por 30 días, así que no sirve para construir el directorio propio. B) OpenStreetMap con Leaflet: mapa libre y gratuito con atribución obligatoria; los datos (ODbL) se pueden guardar en la base propia citando la fuente y sirven para sembrar tiendas iniciales. C) Sin mapa: solo la lista ordenada por distancia de RF-005; más simple, pero menos útil para decidir a qué tienda ir.

## Decisión

ACEPTADA el 16-nov-2026 (frontend #18): B) El mapa de la PWA se dibuja con Leaflet sobre teselas de OpenStreetMap, mostrando solo establecimientos registrados en Valora (comunidad, siembra del equipo o comercios con perfil). Sin ubicación, el mapa muestra las tiendas del municipio elegido (GET /v1/establishments?municipality=…, B#116); con la ubicación, las cercanas desde GET /v1/establishments/nearby con un radio ajustable. La ubicación aproximada del usuario se envía solo para calcular la cercanía, y no se guarda, no se registra en los logs ni aparece en ninguna respuesta (RF-005 RN5, EC-08). El botón "Cómo llegar" abre un enlace de rutas de Google Maps con las coordenadas de la tienda, sin usar APIs de pago. OpenStreetMap puede usarse para sembrar tiendas iniciales, citando la fuente. Las tiendas nuevas llegan por sugerencia de un reportante o por reclamo de un comercio, y siempre pasan por moderación.

## Consecuencias

(+) Costo cero y sin límites de uso de un proveedor comercial. (+) Los datos del directorio son propios y se pueden guardar en PostGIS. (+) Encaja con RF-005, ADR-003 y la regla de privacidad de EC-08. (+) Se reutiliza la consulta /v1/establishments/nearby; no cambia el contrato de la API. (−) Las teselas públicas de OpenStreetMap tienen política de uso justo; si el tráfico crece, hay que usar un proveedor de teselas o servir las propias. (−) Leaflet suma una dependencia al frontend (unos 40 KB) y requiere atribución visible. (−) El mapa no funciona sin conexión; la lista de tiendas recientes sí puede quedar en caché. (−) Las tiendas de barrio que nadie ha registrado no aparecen: depende de la comunidad y de la moderación.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-019](https://app.notion.com/p/41539c4a833b80d29af0c2c2bc244a9b)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente

## Cuerpo de la página de Notion (copiado tal cual)

### Resumen

El mapa muestra las tiendas registradas en Valora cerca del usuario, con un radio ajustable, el valor de su canasta en cada tienda y un botón para ver cómo llegar. Se validó primero en el prototipo interactivo (pestaña Mapa) del entregable MC-E4.

### Qué se muestra

- Solo establecimientos de Valora, con color por tipo: tienda de barrio, minimercado, supermercado y descuento.
- Radio ajustable entre 0,5 y 3 km.
- Por tienda: tipo, distancia, cantidad de precios, valor de la canasta del usuario y botón "Cómo llegar".
- "Sugerir una tienda que no aparece" (RF-005) y "¿Es tu tienda? Reclama el perfil" (RF-015).

### Qué no se hace

- No se usan Places API ni Maps JavaScript API de Google.
- No se extraen tiendas ni precios de Google ni de las cadenas (ADR-011).
- No se guarda la ubicación del usuario.

### Relación con otras decisiones

- ADR-003: las coordenadas viven en PostGIS.
- ADR-011: siembra manual; OpenStreetMap solo como fuente abierta citada.
- ADR-017: el mapa es una vista más de la PWA React + Vite.

### Referencias

- [Google Maps Platform: resumen de precios](https://developers.google.com/maps/billing/overview/)
- [Google Maps Platform: términos específicos del servicio (versión archivada del 1 de mayo de 2025)](https://cloud.google.com/archive/maps-platform/terms/maps-service-terms-20250501)
- [Leaflet](https://leafletjs.com/)
- [OpenStreetMap: derechos de autor y licencia](https://www.openstreetmap.org/copyright)

### Aceptación (16 de noviembre de 2026)

Se aceptó al construir el mapa y la página de cada tienda (frontend #18). Detalles de la implementación:

- <b>Leaflet solo, sin </b><b><code>react-leaflet</code></b><b>:</b> una dependencia menos; el mapa vive en un componente pequeño del frontend.
- <b>Por defecto, el municipio:</b> sin pedir permisos, el mapa muestra las tiendas del municipio elegido (Armenia por defecto). Solo al tocar «Usar mi ubicación» se centra cerca de la persona.
- <b>Privacidad de las teselas (EC-08):</b> las imágenes del mapa vienen de los servidores de OpenStreetMap; al mirarlo, OSM recibe qué zona se pide, como con cualquier mapa en línea. Valora no guarda la ubicación ni la envía a terceros por su cuenta. Con mucho tráfico, se pasa a un proveedor de teselas o a teselas propias (consecuencia ya prevista).
- <b>Accesibilidad:</b> la lista de tiendas es el equivalente del mapa; todo lo que muestra el mapa está en la lista.
- <b>Atribución visible:</b> «© OpenStreetMap».
