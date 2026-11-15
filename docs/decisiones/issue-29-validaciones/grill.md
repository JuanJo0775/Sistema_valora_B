# Grill — issue #29: validaciones del reporte y ráfagas

- **Fuentes:**
  - Issue #29 (Corte 2, épica #4): rechazar campos faltantes y precios no enteros o menores o iguales a cero; rechazar observaciones de más de 24 horas; límite de aportes por usuario y presentación (provisional, parametrizable); errores `{ code, message }`. Comentario: también cubre la ráfaga de RF-012 RN2 (grill de la #20, pregunta 1).
  - RF-012 RN2 (Notion): más de N reportes por hora desde una cuenta generan un bloqueo temporal y un aviso a moderación.
  - Contrato: `POST /v1/reports` ya anuncia 409 `DUPLICATE_REPORT` y 429 «desde la issue #29».
  - Código existente: los campos, el precio entero entre 1 y 10.000.000 y el formato de error ya se validan desde la #14 (`ReportCreateDto`, filtro de errores); `assertObservedAtAccepted` rechaza un precio visto en el futuro; idempotencia por `Idempotency-Key` (EC-07); cola de moderación con motivos (#32, #71).
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué es una observación de más de 24 horas?

- **Decisión:** se rechaza si `observedAt` es más de 24 horas anterior a la llegada al servidor (422 `INVALID_OBSERVATION_DATE`), aunque venga de la cola sin conexión. Es una regla del dominio, junto a la del futuro. La PWA debe avisar y descartar ese reporte.
- **Razón:** un precio de hace más de un día ya no sirve para comparar, y una regla única es más simple que una excepción para la cola.

### 2. ¿Cuál es el límite por usuario y presentación?

- **Decisión:** la misma cuenta no reporta la misma presentación en la misma tienda dos veces en 60 minutos (por la hora de llegada) con otra clave: 409 `DUPLICATE_REPORT`. Un reintento con la misma `Idempotency-Key` sigue respondiendo 200 con el recibo original. 60 minutos es provisional.
- **Razón:** así una cuenta no infla sus propias confirmaciones; reportar el mismo producto en varias tiendas es un uso legítimo.

### 3. ¿Cómo se trata una ráfaga (RF-012 RN2)?

- **Decisión:** más de 20 reportes por hora desde una cuenta (provisional). El reporte 21 y los siguientes responden 429 con `Retry-After` hasta que el más viejo de esa hora salga de la ventana; se cuenta en la base, no en memoria. Al aceptar el reporte 20, `pricing` publica `ReportBurstDetected` v1 (clave seudónima y reportes de esa hora) y `reliability` pone esos reportes en la cola con el motivo nuevo `rafaga`. El moderador decide como siempre, sin ver la cuenta.
- **Razón:** cumple el bloqueo temporal y el aviso de RN2 con la cola y las decisiones que ya existen.

## Decisiones menores (sin pregunta)

- **Orden de la cola:** `apelacion`, `desviacion`, `rafaga`, `marcado`.
- **Orden de las reglas al registrar:** primero la idempotencia (un reintento siempre devuelve su recibo), luego la fecha, el duplicado y la ráfaga.
- **Persistencia:** `reliability.bursts` (un reporte por fila); el estado del aporte cuenta la ráfaga como «en revisión».
