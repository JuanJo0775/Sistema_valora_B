# Contrato — issue #33: suspensión de cuentas y matriz de autorización

Cambios en `docs/openapi.yaml` y en los eventos internos, en el mismo pull request que el código. No hay rutas nuevas.

## `POST /v1/auth/login`

| Parte | Antes | Después |
|---|---|---|
| 403 | No estaba | `ACCOUNT_SUSPENDED`: la contraseña es correcta, pero la cuenta está suspendida; `message` dice hasta cuándo (pregunta 4). Con la contraseña incorrecta sigue siendo 401, para no revelar el estado. |

## Rutas con sesión

Una cuenta suspendida no tiene sesiones: al suspenderla se revocan, y cualquier ruta con sesión responde 401 `UNAUTHORIZED`.

## `POST /v1/moderation/{itemId}/decision`

`observar_cuentas` deja de ser «solo bitácora»: suspende 7 días al autor del reporte. `descartar` suspende al autor si completa 3 descartes seguidos (RN6). La descripción de la ruta lo explica.

## Eventos internos

**`ReporterSuspensionRequested` v1 (nuevo, publica `reliability`, escucha `identity`):**

```json
{
  "reporterKey": "hex de 64 caracteres",
  "reason": "observar_cuentas",
  "suspendedUntil": "2026-11-21T14:00:00.000Z"
}
```

`reason` es `observar_cuentas` o `rechazos_seguidos`. Si ninguna cuenta tiene esa clave, `identity` no hace nada.
