# Contrato — issue #71: apelación de un reporte descartado

Cambios en `docs/openapi.yaml` y en los eventos internos, en el mismo pull request que el código.

## `POST /v1/reports/{reportId}/appeal` (nueva)

- **Seguridad:** sesión de `reportante` y `X-CSRF-Token`.
- **Cuerpo:** `{ "note": "El precio sí era ese; la foto está en la etiqueta" }` (10 a 500 caracteres).

| Respuesta | Cuándo |
|---|---|
| 202 | Apelación recibida; entra a la cola. |
| 400 | Motivo inválido o id que no es UUID. |
| 401 / 403 | Sin sesión / otro rol o sin CSRF. |
| 404 | El reporte no existe o no es de esta cuenta. |
| 409 | `ALREADY_APPEALED`: ya se apeló. |
| 422 | `NOT_APPEALABLE` (no está descartado) o `APPEAL_WINDOW_CLOSED` (pasaron 7 días). |

## `GET /v1/me/reports/{reportId}/status` (nueva)

- **Seguridad:** sesión de `reportante`.
- **200:**

```json
{ "reportId": "uuid", "status": "descartado", "appealableUntil": "2026-11-21T14:00:00.000Z" }
```

`status`: `normal`, `en_revision`, `descartado`, `apelacion_pendiente`, `apelacion_aceptada` o `apelacion_rechazada`. `appealableUntil` solo aparece si todavía se puede apelar. Nunca dice quién decidió ni quién marcó.

- **404:** el reporte no existe o no es de esta cuenta. **Cache-Control:** `no-store`.

## `GET /v1/moderation/queue`

`reason` gana `apelacion` (primero en el orden). `ModerationItem` gana `appealNote` (el motivo del autor), solo en las apelaciones.

## `POST /v1/moderation/{itemId}/decision`

| Parte | Después |
|---|---|
| 409 | También `SAME_MODERATOR`: quien descartó no decide la apelación. |
| 422 | `DECISION_NOT_ALLOWED`: `observar_cuentas` sobre una apelación. |

## Sesión limitada de una cuenta suspendida (pregunta 5)

| Ruta | Antes (#33) | Después |
|---|---|---|
| `POST /v1/auth/login` | 403 `ACCOUNT_SUSPENDED` | 204: entra con una sesión limitada. |
| `GET /v1/auth/session` | 401 | 200 con `suspendedUntil`. |
| `POST /v1/auth/logout`, apelar y estado | 401 | Permitidas. |
| Las demás rutas con sesión | 401 | 403 `ACCOUNT_SUSPENDED`. |

## Eventos internos

**`ReporterSuspensionLifted` v1 (nuevo, publica `reliability`, escucha `identity`):**

```json
{ "reporterKey": "hex de 64 caracteres", "suspendedUntil": "2026-11-21T14:00:00.000Z" }
```

`suspendedUntil` es la fecha que habría puesto el descarte revertido; `identity` levanta la suspensión solo si `suspended_until` de la cuenta es igual.
