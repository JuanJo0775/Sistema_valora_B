# Grill — issue #18: estado de vigencia por categoría (RF-010)

- **Fuentes:**
  - RF-010: RN1, RN2 y el criterio de aceptación.
  - ADR-005, aceptado el 11-nov-2026.
  - Issue #18.
  - `docs/openapi.yaml`, campo `freshness`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón. Decide la integrante que dirige el backend.

## Lo que ya estaba definido

- **RN1:** un precio reportado es vigente durante un TTL por categoría. Los valores iniciales son provisionales: 7 días para productos frescos y 14 para el resto.
- **RN2:** entre 1 y 2 veces el TTL está «por confirmar». Después de 2 veces el TTL está «desactualizado» y no entra a la comparación.
- **Issue #18:**
  - Los plazos son parámetros.
  - Se usa la hora de observación, nunca la de sincronización.
  - Hay que probar los casos justo en el plazo, un segundo después y con fecha futura.

## Preguntas

### 1. Nombres de los estados

- **Conflicto:** RF-010, ADR-005 y la issue dicen *vigente / por confirmar / desactualizado*. `openapi.yaml` dice `vigente / por_vencer / vencido`.
- **Opciones:**
  - (a) Usar los nombres de Notion y corregir el contrato.
  - (b) Usar los del contrato y cambiar RF-010, ADR-005 y la issue.
- **Recomendación:** (a).
  - Notion manda sobre los documentos del repositorio.
  - «Por vencer» describe un precio que todavía sirve, pero entre 1 y 2 TTL el precio ya pasó su plazo y necesita confirmación.
  - El criterio de aceptación de RF-010 exige literalmente la etiqueta «por confirmar».
- **Decisión:** (a). Los estados son `vigente`, `por_confirmar` y `desactualizado`. El contrato se corrige en esta issue.

### 2. Qué recibe la regla: el TTL o la categoría

- **Opciones:**
  - (a) Recibe el TTL ya resuelto: `fechaObservación`, `ahora` y `ttl`.
  - (b) Recibe la categoría y una tabla categoría → TTL.
- **Recomendación:** (a).
  - La lista de categorías aún no está definida (qué es «fresco» y si habrá más es asunto del catálogo, RF-003). La regla no debe cambiar cuando cambien las categorías.
  - Es más simple de probar.
  - Los valores provisionales quedan fuera de la regla, en un solo lugar.
- **Decisión:** (a). La traducción categoría → TTL vive fuera de `domain`.

### 3. Dónde quedan los valores provisionales (7 y 14 días)

- **Opciones:**
  - (a) No guardarlos en esta issue: se configuran cuando el módulo de comparación (H2-01, paso 6) calcule la vigencia de precios reales.
  - (b) Agregarlos ya a `.env.example` y a la validación de la configuración.
- **Recomendación:** (a).
  - YAGNI: ningún código de este paso los usa.
  - Si van en `.env` o en una tabla de categorías del catálogo depende de cómo se definan las categorías, que todavía no existen.
- **Decisión:** (a).
  - El criterio «los plazos son parámetros» se cumple porque el TTL entra como parámetro a la regla.
  - Pendiente para el paso de comparación: configurar 7 días (frescos) y 14 días (resto), valores provisionales de ADR-005.

### 4. Qué estado corresponde justo en el límite

- **Opciones** (con edad = ahora − fecha de observación):
  - (a) vigente si edad ≤ TTL; por confirmar si TTL < edad ≤ 2 TTL; desactualizado si edad > 2 TTL.
  - (b) vigente si edad < TTL; por confirmar si TTL ≤ edad < 2 TTL; desactualizado si edad ≥ 2 TTL.
- **Recomendación:** (a), porque sigue la letra de Notion:
  - RN1 dice vigente «durante un TTL».
  - RN2 dice desactualizado «después de 2 veces el TTL».
  - El escenario de RF-010 excluye el precio con «más del doble de su TTL».
- **Decisión:** (a).
  - Con TTL de 7 días, exactamente 7 días es vigente y 7 días + 1 segundo es por confirmar.
  - Exactamente 14 días es por confirmar y 14 días + 1 segundo es desactualizado.

### 5. Fecha de observación en el futuro

- **Contexto:** la fecha la pone el dispositivo del reportante. El registro funciona sin conexión (ADR-010) y se usa la hora de observación, no la de sincronización, así que un reloj adelantado puede producir fechas futuras.
- **Opciones:**
  - (a) Rechazarla con un error del dominio.
  - (b) Tratarla como vigente (edad 0).
- **Recomendación:** (a).
  - Un dato imposible no debe pasar como bueno en silencio: con (b), un precio fechado un mes adelante saldría vigente todo ese mes (EC-03).
  - El margen para relojes desajustados se decide al registrar el reporte, no aquí.
- **Decisión:** (a). La regla lanza `InvalidObservationDateError` si la fecha de observación es posterior a «ahora».
- **Pendiente para el paso 5** (`POST /v1/reports`): decidir si se acepta un margen de tolerancia para relojes adelantados y cuánto. No se inventa un valor aquí.

### 6. Cómo se cuentan los días del TTL

- **Opciones:**
  - (a) 24 horas exactas: un TTL de N días equivale a N × 24 horas.
  - (b) Días de calendario en hora de Colombia: cuenta la fecha, no la hora.
- **Recomendación:** (a).
  - La issue pide probar «justo en el plazo» y «un segundo después», que solo tiene sentido midiendo al segundo.
  - No depende de zonas horarias.
  - Lo que se muestra («hace 3 días») es texto del frontend y no cambia con esta decisión.
- **Decisión:** (a). La regla recibe instantes (`Date`) y un TTL en días, y compara diferencias de tiempo exactas.

## Resumen de la regla

Con edad = ahora − fecha de observación y TTL en días de 24 horas:

| Edad | Estado |
|---|---|
| fecha de observación posterior a «ahora» | error `InvalidObservationDateError` |
| 0 ≤ edad ≤ TTL | `vigente` |
| TTL < edad ≤ 2 × TTL | `por_confirmar` |
| edad > 2 × TTL | `desactualizado` |

## Pendientes que salen de este grill

- **Paso 6 (comparación):** configurar los TTL provisionales, 7 días para frescos y 14 para el resto (ADR-005), y definir de dónde sale la categoría de cada producto.
- **Paso 5 (registro de reportes):** decidir el margen de tolerancia para fechas futuras.
