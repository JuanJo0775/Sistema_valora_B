# ADR-034: Plan de compra: recomendaciones calculadas en el cliente y lista guardada en el teléfono

- **Estado:** Propuesto
- **Fecha:** 2026-11-17 (texto actualizado el 2026-11-22)
- **Responsables:** pendiente de asignar; pendiente de revisión del equipo. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-06 (neutralidad), EC-08 (privacidad), EC-07 (fiabilidad sin conexión), EC-04 (rendimiento)
- **Requisitos relacionados:** RF-009 (comparación), RF-005 (ubicación), RF-010 (vigencia); RNF-007, RNF-008; ADR-009, ADR-010, ADR-019, ADR-035
- **Registro oficial:** base ADRs de Notion (el estado solo cambia allí, por decisión del equipo).
- **Numeración:** se renumeró el 22-nov-2026 (antes 032): el 032 y el 033 ya los usa el backend; el rango 023 a 028 está reservado a AS-E4.

## Contexto

La canasta (F#31, #76, #78) calculaba «Todo en una tienda» en el frontend. El 17-nov-2026 el dueño del proyecto reabrió la decisión del 16-nov de no agregar «En dos tiendas»: repartir la lista entre varias tiendas según el radio que elija la persona, estimar el traslado, mostrar un domicilio solo informativo y guardar el plan en la propia app con la dirección y el «Cómo llegar» de cada tienda. Después pidió que el sistema **recomiende** en lugar de pedir parámetros que nadie entiende (factor de rodeo, velocidad, forma de contar el traslado).

Restricciones: el alcance oficial excluye venta en línea, carrito, pagos, pedidos y domicilios; ADR-010 deja la consulta fuera del modo sin conexión; EC-06 exige que el orden dependa solo de criterios declarados; EC-08 prohíbe guardar la ubicación de la persona; no se inventan cifras.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Recomendaciones y reparto en el frontend con funciones puras; la lista se guarda como instantánea en `localStorage` | Cero cambios de backend y de contrato; la ubicación no sale del teléfono; reversible; sigue el precedente de F#31 | La lógica del reparto vive en el cliente |
| B. Endpoint de reparto en el backend | Lógica junto a la regla neutral (ADR-009) | Cambia el contrato y el núcleo; entra en la medición de carga EC-04; la ubicación debe ir por POST |
| C. Guardar la lista en la cuenta desde el inicio | Sobrevive a cambiar de teléfono | Exige tablas, módulo, sesión y borrado de datos (RF-001); excluye a quien no tiene cuenta |
| D. Solo imprimir o compartir, sin guardar | Mínimo | No cumple «guardar en la app» |

## Decisión

Se elige **A**.

1. **Recomendaciones, no parámetros.** Una función pura (`features/plan/recommend.ts`) sobre el reparto exacto `bestSplits` (hasta 40 tiendas) recomienda: la más barata (1, 2 o 3 tiendas), todo en una tienda, la más cercana (solo con ubicación) y la más barata de todo el municipio. Una opción con más tiendas solo aparece si cuesta menos; una que no cubre toda la lista se rotula «La que más cubre» y nunca «la más barata». Solo cuentan precio, distancia e identificadores (EC-06).
2. **Dentro de la canasta.** El plan vive en `/canasta` (panel «Dónde comprar»), no en una página aparte; `/canasta/plan` se mantiene hasta unificar rutas.
3. **Consulta y cercanía:** por municipio, con la distancia calculada en el dispositivo (ADR-035). La ubicación no sale del teléfono.
4. **Traslado.** Se dice con una frase («Estas dos tiendas tienen todos tus productos, pero están separadas por 2,9 km (≈ 39 min a pie). Tú decides si te desplazas»). El rodeo (1,3 veces la línea recta) y la velocidad (4,5 km/h a pie) son fijos y se explican en una línea; solo queda la pregunta opcional «¿Cuánto te cuesta ir?» («Voy a pie», «Pago pasaje», «Gasto por km»), sin pesos por defecto. Siempre «estimado».
5. **Domicilio.** Solo la tarifa que escribe la persona, rotulada «estimado», con el texto fijo «Valora no hace pedidos ni domicilios. La tarifa es la que tú escribiste; confírmala con la tienda.»
6. **Lista guardada.** `localStorage`, clave `valora:planes`, versión 1, con migración y respaldo del valor ilegible. Guarda tiendas (dirección y coordenadas de la tienda), productos, precios con fecha, vigencia y fuente; **nunca** coordenadas ni distancias de la persona. Se lee sin conexión; actualizar precios requiere red y muestra el antes y el ahora.
7. **Compartir.** Texto, `navigator.share`, copiar, WhatsApp, `.txt` e impresión, sin dependencias nuevas. «Cómo llegar» reutiliza `shared/directions.ts` (ADR-019).

### Relación con otros ADR

- **ADR-035** (aceptado): cómo se consulta y dónde se calcula la cercanía.
- **ADR-010:** lo precisa, no lo reemplaza: la consulta sigue requiriendo conexión; lo que funciona sin red es leer un documento que la persona guardó, con la fecha de cada precio a la vista. `DECISIÓN DEL EQUIPO:` confirmar esta lectura.
- **Alcance oficial:** `DECISIÓN DEL EQUIPO:` matizar el «Fuera: domicilios» («Valora no hace ni gestiona pedidos ni domicilios; el plan puede mostrar un costo de domicilio que escribe la persona, solo informativo»).

## Consecuencias

- Positivas: cero cambios de backend y de contrato; la ubicación no sale del teléfono; reversible; la persona no elige parámetros técnicos.
- Negativas o riesgos: los precios guardados envejecen (se muestra la fecha y se puede actualizar); la lógica del reparto vive en el cliente; el reparto exacto con 3 tiendas no está medido en un teléfono de gama baja; la distancia es en línea recta.
- Dependencia con AS-E4: si cambia la forma de `ComparisonItem`, el plan solo lee `establishment`, `presentationId`, `priceCop`, `source`, `freshness` y `observedAt`.

## Verificación

Pruebas primero para el reparto, las recomendaciones (propiedades contra búsqueda exhaustiva), el traslado, la lista guardada y las pantallas; E2E a 360, 390, 768, 820, 1280 y 1440 px, sin conexión e impresión; una E2E cuenta las solicitudes (ADR-035). Pendiente: medir el reparto con 3 tiendas en un teléfono de gama baja y probar en dispositivo real y en Safari o Firefox.

## Plan de trabajo

Hecho: reparto, traslado, lista guardada, pantalla, compartir e imprimir, actualizar precios, panel dentro de la canasta y recomendaciones. En curso: listas guardadas con nombre (hasta 20). Pendiente: unificar rutas y presencia en Inicio y barra. Etapa opcional posterior: guardar en la cuenta, con su propio ADR.
