# Contrato API — issue #14: `POST /v1/reports` con `Idempotency-Key`

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código.

## `POST /v1/reports`

- **Descripción:** se agrega que, hasta la #16, la ruta no exige sesión (grill, pregunta 2). El bloque `security` se mantiene porque es el destino.
- **Cabecera `Idempotency-Key`:** sin cambios (UUID, requerida). Si falta o no es UUID, responde 400.

| Respuesta | Antes | Después |
|---|---|---|
| 201 | Reporte recibido | Sin cambios: `ReportReceipt` con `status: recibido`. |
| 200 | Reintento con la misma clave | Aclara: misma clave **y mismo cuerpo**; devuelve el `id`, el `status` y el `receivedAt` originales. |
| 400 | `BadRequest` | Sin cambios. Incluye la clave ausente o inválida, `priceCop` fuera de 1 a 10.000.000 y un `priceType` que no está en la lista. |
| 401 | Se requiere sesión | Marcada «desde la #16». |
| 409 | Reporte repetido en la última hora | Dos códigos: `IDEMPOTENCY_KEY_REUSED` (misma clave, otro cuerpo) y `DUPLICATE_REPORT` (misma cuenta, producto y tienda en la última hora, «desde la #29»). |
| 422 | Antigüedad mayor a 24 h o precio fuera de rango | Tres códigos hoy: `INVALID_OBSERVATION_DATE` (`observedAt` más de 5 minutos en el futuro), `UNKNOWN_PRESENTATION` y `UNKNOWN_ESTABLISHMENT`. La antigüedad mayor a 24 h se marca «desde la #29». El precio fuera de rango sale de aquí porque ya es un 400. |
| 429 | Límite de frecuencia | Marcada «desde la #29». |

Ejemplo de 409:

```json
{
  "code": "IDEMPOTENCY_KEY_REUSED",
  "message": "La clave Idempotency-Key ya se usó con otro reporte."
}
```

## Esquema `ReportCreate`

| Campo | Antes | Después |
|---|---|---|
| `priceType` | `normal`, `oferta`, `combo` | `normal`, `oferta` (pregunta 8); `normal` por defecto. |
| `observedAt` | «máximo 24 h» | Aclara: no puede estar más de 5 minutos en el futuro; el máximo de 24 h llega con la #29. |

`ReportReceipt` no cambia: en la #14, `status` siempre es `recibido`.

## Evento interno `PriceReported` (versión 1)

No es parte de la API REST, pero es un contrato entre módulos (ADR-015): un cambio de forma exige la versión 2.

```json
{
  "reportId": "uuid",
  "presentationId": "uuid",
  "establishmentId": "uuid",
  "priceCop": 4500,
  "priceType": "normal",
  "observedAt": "2026-11-12T14:00:00.000Z",
  "receivedAt": "2026-11-12T14:00:03.000Z"
}
```

Sin `reporterId` ni nada que identifique o ubique al reportante (EC-08).
