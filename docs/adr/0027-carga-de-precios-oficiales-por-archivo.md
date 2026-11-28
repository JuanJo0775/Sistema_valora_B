# ADR-027: Carga de precios oficiales por archivo: al momento, por código de barras, con informe por fila

- **Estado:** Aceptado (confirmación del equipo: 2026-11-28; reunión con el docente realizada, fecha no informada)
- **Fecha:** 2026-11-26 (grill del 21-nov-2026, D7; ajustado al código construido en B5)
- **Responsables:** equipo de backend; revisión con el docente confirmada por el equipo, sin cambios a la decisión (fecha de reunión no informada).
- **Escenarios relacionados:** EC-02, EC-05
- **Requisitos relacionados:** RF-016 (RN4 y los escenarios «Carga por archivo con errores» y «Comercio sin POS»), RNF-014. Ajusta ADR-016 y el contrato (`202` pasa a `200`). Relacionado con ADR-037.

## Contexto

ADR-016 elige un archivo para las cargas por lote. RF-016 RN4 pide guardar las filas válidas e informar el motivo de cada rechazada, sin descartar el archivo. El contrato decía `202 Archivo recibido para procesar` pero no tenía una ruta para consultar el resultado. La semilla (`imports`) usa la política contraria («todo o nada»). Los comercios no conocen los UUID de las presentaciones, y Render corre una sola instancia (ADR-012): un trabajo largo competiría con la API.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Procesamiento diferido con `202` y una ruta de estado | Aguanta archivos grandes | Agrega un trabajo, un estado, archivos guardados y una ruta; el comercio tiene que volver a consultar |
| B. Al momento, con `200` y el informe por fila en la respuesta, con un límite de filas y de tamaño | Resultado inmediato; sin cola ni estados | Un archivo muy grande no cabe |
| C. Identificar el producto por nombre | Natural para el comercio | Ambiguo y propenso a errores (RNF-014) |
| D. Identificar por código de barras | Datos del catálogo verificados; fácil de sacar del empaque | Muchos productos de barrio no lo traen; depende de que la semilla los tenga (#118) |
| E. Plantilla prellenada con el identificador interno | Sin ambigüedad | Hay que generarla y mantenerla |
| F. Todo o nada en una transacción | Simple | El comerciante pierde el trabajo por una fila mala (política de la semilla) |

## Decisión

Se adoptan la B y la D, y se descartan la A, la C, la E y la F. El borrador de AS-E4 proponía la E (plantilla prellenada); el grill del 21-nov la reemplazó por el código de barras.

1. **Al momento:** `POST /v1/commerce/prices/bulk` responde **200** (antes 202) con el resultado. Archivo «CSV UTF-8» con el encabezado `codigo_barras;precio`, separado por punto y coma, **máximo 1.000 filas y 1 MB**. Aún no había código que usara el 202.
2. **Se publican las buenas y se informan las malas:** cada fila mala sale con su número de fila de Excel, el código y el motivo. Las filas buenas se publican juntas y quedan reconfirmadas (ADR-005, D4).
3. **Cada fila pasa por la misma evaluación que un precio suelto (ADR-037):** las claramente fuera de rango no se guardan y salen como `IMPLAUSIBLE_OFFICIAL_PRICE`; las que no tienen referencia se aceptan «en revisión», se informan aparte (`inReview`) y esperan a moderación; no cuentan en `published`.
4. **Identificación por código de barras** a través de la interfaz pública de `catalog`. Si el código no está en Valora, la fila falla con `UNKNOWN_BARCODE` y la sugerencia de proponer el producto (RF-003). **Nunca se crea un producto desde el archivo** (RF-014).
5. **Idempotente:** subir el mismo archivo otra vez actualiza sin duplicar (misma tienda y presentación) y reconfirma lo que trae.
6. Cada fila publicada emite `OfficialPricePublished` por el outbox (ADR-023). No se reutiliza `imports`: su política es distinta y es un módulo de soporte sin relación con `commerce`.

## Consecuencias

- Positivas: resultado inmediato; sin cola, sin estados y sin archivos guardados; el escenario de 50 filas con errores se prueba directamente; el comercio sin POS puede usar una hoja de cálculo.
- Negativas / riesgos: cambia el `202` del contrato a `200` (el contrato de `/commerce` era preliminar); los productos sin código de barras no se pueden cargar por archivo y deben publicarse uno a uno; un archivo con 1.000 filas hace consultas de referencia por lotes de 20 en la misma petición.
- Trade-offs aceptados: un límite de tamaño a cambio de no operar un trabajo en segundo plano con una sola instancia.

## Verificación

- `src/domain/official-price-file.spec.ts` (lectura del archivo) y `src/modules/commerce/application/upload-official-prices.spec.ts` (filas buenas y malas, repetido sin duplicar, código desconocido, en revisión).
- `test/contract/commerce.contract.spec.ts`: el contrato de `POST /v1/commerce/prices/bulk`.
- Depende de que la semilla traiga códigos de barras (#118): hoy 77 de 150 productos los tienen.

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-027).
- Documentos: `docs/decisiones/epic-8-modulo-comercial/grill.md` (D7). ADR-005, ADR-016, ADR-023, ADR-037.
- Issues / PRs: B#205 (carga por archivo), B#118 (códigos de barras), B#210 (este registro).


## Aceptación y evidencia — 28-nov-2026

La decisión se mantiene sin cambios tras la reunión con el docente confirmada por el equipo. Se conserva la fecha original del ADR (26-nov-2026).

La evidencia incluye `official-price-file.spec.ts`, `upload-official-prices.spec.ts`, `commerce-official-prices-http.spec.ts` y la prueba de contrato `test/contract/commerce.contract.spec.ts`, que ejercita `POST /v1/commerce/prices/bulk` en modo estricto. Se verifica el tratamiento de filas buenas y malas, idempotencia, códigos desconocidos, precios en revisión y respuestas del contrato.

La semilla contiene código de barras en 77 de 150 productos. Es una limitación conocida del alcance de carga masiva, no una promesa de cobertura para productos sin código; esos se publican individualmente.
