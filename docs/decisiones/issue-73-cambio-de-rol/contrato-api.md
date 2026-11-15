# Contrato — issue #73: cambio de rol auditado

Cambios en `docs/openapi.yaml`, en el mismo pull request que el código.

## `POST /v1/moderation/roles` (nueva)

- **Seguridad:** sesión de `moderador` y `X-CSRF-Token`.
- **Cuerpo:**

```json
{ "email": "ana@correo.com", "role": "moderador", "note": "Se une al equipo de moderación" }
```

| Campo | Regla |
|---|---|
| `email` | Correo, hasta 254 caracteres. |
| `role` | `reportante` o `moderador`. |
| `note` | Obligatorio, de 10 a 500 caracteres. |

| Respuesta | Cuándo |
|---|---|
| 204 | Rol cambiado y anotado en la bitácora. |
| 400 | Datos inválidos (también `role: comercio`). |
| 401 | Sin sesión. |
| 403 | Otro rol o sin CSRF. |
| 404 | Ninguna cuenta tiene ese correo. |
| 409 | `OWN_ROLE` (su propio rol) o `ROLE_UNCHANGED` (ya tiene ese rol). |
| 429 | Más de 20 cambios del mismo moderador en 15 minutos (provisional). |

## `POST /v1/moderation/{itemId}/decision`

| Parte | Antes | Después |
|---|---|---|
| 409 | No estaba | `OWN_REPORT`: el moderador es el autor del reporte. |
