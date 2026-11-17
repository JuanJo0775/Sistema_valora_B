# Contrato — issue #29: validaciones del reporte y ráfagas

## `POST /v1/reports`

| Respuesta | Antes | Después |
|---|---|---|
| 409 | `IDEMPOTENCY_KEY_REUSED`; `DUPLICATE_REPORT` anunciado | También `DUPLICATE_REPORT`: la cuenta ya reportó esa presentación en esa tienda en los últimos 60 minutos. |
| 422 | `INVALID_OBSERVATION_DATE` si es futura | También si la observación es de hace más de 24 horas. |
| 429 | Anunciado | Más de 20 reportes de la cuenta en la última hora; `Retry-After` con los segundos que faltan. |

## `GET /v1/moderation/queue`

`reason` gana `rafaga` (después de `desviacion` y antes de `marcado`).

## Eventos internos

**`ReportBurstDetected` v1 (nuevo, publica `pricing`, escucha `reliability`):**

```json
{ "reporterKey": "hex de 64 caracteres", "reportIds": ["uuid", "uuid"] }
```

Los reportes de esa cuenta en la última hora, incluido el que completó el límite. Sin el id de la cuenta (EC-08).
