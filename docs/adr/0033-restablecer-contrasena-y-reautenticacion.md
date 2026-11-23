# ADR-033: Contraseña olvidada, contraseña para cuentas de Google y reautenticación reciente

- **Estado:** Aceptado (decisión del equipo, registrada el 23-nov-2026)
- **Fecha:** 2026-11-22
- **Responsables:** integrante que dirige el backend; revisado por el equipo.
- **Escenarios relacionados:** EC-08 (privacidad)
- **Requisitos relacionados:** RNF-007, PR-15, Ley 1581 de 2012 (art. 8), ADR-013 (privacidad por diseño), ADR-014 (sesiones), ADR-029 (identidad propia, verificación de correo e inicio con Google), ADR-032 (eliminación de cuenta)

## Contexto

Dos huecos en `identity`:

- **No existe «olvidé mi contraseña».** Quien la pierde no tiene cómo volver a entrar.
- **Una cuenta creada con Google no tiene contraseña** (`password_hash` nulo, ADR-029 fase 2). Por eso no puede crear una contraseña para entrar también con correo (la eliminación de cuenta la resolvió #179: confirma con su correo) y, al estar pendiente de eliminación, no podía usar `restore-account`, que pide contraseña.

Ya existen las piezas para resolverlo: un token aleatorio con hash y un solo uso para verificar el correo (`email_verifications`, ADR-029), el puerto `EmailSender` (Resend), los límites de intentos en memoria (#16) y la revocación de sesiones (ADR-032).

## Decisión

1. **Enlace por correo de 1 hora.** `POST /v1/auth/forgot-password { email }` (pública) guarda el hash SHA-256 de un token aleatorio de 32 bytes en la tabla nueva `identity.password_resets` (`id`, `account_id`, `token_hash`, `created_at`, `expires_at`, `used_at`; llave foránea con `ON DELETE CASCADE`, índice único del hash e índice único parcial de un solo enlace sin usar por cuenta) y envía por `EmailSender` un correo en español con `${APP_URL}/restablecer-contrasena?token=<token>`. Vence en 1 hora y se usa una sola vez. Pedir otro invalida los anteriores de la cuenta, en una transacción con candado de la cuenta. Funciona igual para una cuenta de Google: ese enlace crea su primera contraseña.
2. **Sin enumeración.** Responde **siempre 202 sin cuerpo**, exista o no la cuenta. Con una cuenta real, guardar el token y enviar el correo corren en segundo plano (como el registro, ADR-029), así la respuesta tarda lo mismo y una caída del proveedor tampoco se nota. Una cuenta pendiente de eliminación (ADR-032) no recibe el correo y la respuesta es la misma. Los errores de envío se registran sin correo ni token. El único caso distinto es el límite de frecuencia: 5 por IP cada 15 minutos y 3 por correo por hora, que cuentan **existan o no** las cuentas (429 con `Retry-After`, el mismo mensaje genérico del filtro de errores).
3. **Restablecer.** `POST /v1/auth/reset-password { token, password }` (pública; el token es la credencial, como `verify-email`). La contraseña cumple las **mismas reglas que el registro** (`PASSWORD_LENGTH`, de 10 a 128 caracteres, definidas una sola vez y compartidas por los DTO). Un token inexistente, vencido o usado responde igual: **422 `INVALID_TOKEN`**. En una sola transacción: gasta el token con un `UPDATE` atómico (dos peticiones a la vez no lo gastan dos veces), guarda el hash con Argon2id, **revoca todas las sesiones** de la cuenta y, si el correo no estaba verificado, lo marca verificado (el enlace llegó a su bandeja). Responde 204 y **no abre sesión**. El hash se calcula antes de mirar el token, para que un token inexistente tarde lo mismo. Límite de 20 intentos por IP en 15 minutos.
4. **Cambiar o crear la contraseña desde la sesión.** `POST /v1/me/password` (sesión + CSRF; cualquier rol, también suspendida). Con contraseña: `{ currentPassword, newPassword }`, 403 `INVALID_PASSWORD` si la actual falta o no coincide, con los mismos límites que eliminar la cuenta (5 fallos por cuenta, 20 por IP en 15 minutos). Sin contraseña (Google): `{ newPassword }`, permitido solo con la **reautenticación reciente** del punto 5. Con éxito responde 204 y revoca las **otras** sesiones; la actual sigue.
5. **Reautenticación reciente (≤ 10 minutos) para cuentas sin contraseña.** Una cuenta de Google no tiene un secreto propio que el servidor pueda comprobar, así que la prueba de que quien actúa es la dueña es que **acaba de entrar con Google**: la fecha de creación de la sesión (`sessions.created_at`, que ya existía) debe estar a 10 minutos o menos. Si no, 403 **`REAUTH_REQUIRED`** y el frontend pide volver a entrar con Google (una sesión nueva). Aplica a crear la primera contraseña (no a eliminar la cuenta, punto 6). `ResolveSession` expone `createdAt` y `hasPassword`; no hay columna ni estado nuevo. Pedir volver a entrar no cuenta como intento fallido en los límites.
6. **Eliminar la cuenta no cambia** (ADR-032, #179): con contraseña `{ password }`, sin contraseña (Google) `{ confirmEmail }` con el correo de la cuenta (403 `INVALID_CONFIRMATION` si no coincide). La reautenticación reciente de este ADR **no** se aplica ahí.
6 bis. **Restaurar una cuenta de Google.** `POST /v1/auth/restore-account` exige correo y contraseña, y una cuenta creada con Google no tiene contraseña: quedaría sin salida durante la gracia. Por eso `SignInWithGoogle` (el callback de Google) restaura la cuenta **vinculada a ese sub de Google** que tenga la eliminación pendiente: cancela la eliminación (`AccountDeletionRepository.cancel`, condicional: si la purga o una restauración simultánea ganó la carrera, no hay doble efecto) y abre la sesión, con la misma redirección a `/` y cookie de siempre. Google ya probó quién es. Una cuenta con contraseña que solo coincide por el correo (sin vínculo con Google) sigue sin abrir sesión ni vincularse durante la gracia (`/entrar?error=eliminacion-pendiente`): se restaura con su contraseña.
7. **`GET /v1/auth/session` suma `hasPassword: boolean`** (cambio aditivo).
8. **Privacidad (EC-08).** `password_resets` guarda solo el hash del token y fechas: ni el token, ni el correo, ni la IP. Ninguna respuesta trae el token ni el hash, y el token nunca se escribe en logs. La purga de cuenta (ADR-032) borra sus `password_resets` (cascada, y borrado explícito en la transacción). La prueba guardiana de esquema falla si la tabla gana otras columnas.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Código numérico de 6 dígitos por correo | Se escribe a mano | Adivinable por fuerza bruta con límites en memoria; el enlace de 256 bits no lo es |
| B. Reutilizar `email_verifications` con un «propósito» | Una tabla menos | Mezcla dos flujos con vigencias (24 h y 1 h) y consecuencias distintas; el índice de un solo enlace vigente haría que pedir uno invalide el otro |
| C. Que la cuenta siga las reglas actuales y devolver 404/«no existe» si el correo no está registrado | Mensaje más claro | Enumera qué correos tienen cuenta (EC-08); descartada |
| D. Abrir sesión al restablecer | Un paso menos | Un enlace del correo no debería dejar una sesión abierta sin la contraseña nueva probada; el cliente lleva a entrar |
| E. Para crear la primera contraseña de una cuenta de Google, pedir el correo escrito como confirmación (como en la eliminación de cuenta, #179) | Sin estado nuevo | Quien tenga la sesión abierta (equipo compartido, sesión robada) ya conoce el correo: no prueba nada; crear una contraseña da una entrada permanente a la cuenta, más grave que eliminarla con 10 días de gracia |
| F. Reautenticar por OAuth con `prompt=login` y un parámetro propio | Garantiza una autenticación fresca | Más superficie y estado nuevo en la compañera del inicio con Google; la sesión nueva ya es la prueba. Puede añadirse después sin cambiar este contrato |
| **G. Enlace por correo de 1 hora + sesión de ≤10 minutos para cuentas sin contraseña (elegida)** | Reutiliza el token con hash, `EmailSender`, límites y revocación; sin enumeración; sin cambios en el inicio con Google | Depende de la entrega del correo; los límites viven en memoria (se reinician con el servidor) |

## Consecuencias y riesgos

- **Entrega del correo.** Si Resend o el dominio fallan, la persona no recibe el enlace y no hay otra vía; el registro del servidor avisa sin datos personales. Depende de `EMAIL_PROVIDER=resend` y `APP_URL` (`docs/despliegue.md`); con `console` solo se escribe el enlace en desarrollo y pruebas.
- **Quien controla el correo controla la cuenta.** Es el modelo de cualquier «olvidé mi contraseña». El enlace vence en 1 hora, es de un solo uso y cierra todas las sesiones al usarse.
- **Marcar el correo como verificado** al restablecer es correcto porque el token solo viaja a esa dirección.
- **Tiempos.** La respuesta de `forgot-password` no espera al proveedor de correo, pero sí consulta la cuenta; la diferencia con una cuenta inexistente es de milisegundos y los límites cuentan igual en ambos casos.
- **Límites en memoria**, como el resto (#16): se reinician con el servidor y no se comparten entre instancias.
- **Restaurar con Google** cancela la eliminación sin otra confirmación: quien controle la cuenta de Google (o una sesión de Google abierta en un equipo ajeno) puede deshacer una eliminación pedida por la dueña. Se acepta: restaurar es reversible por la dueña y no expone datos.
- **«Sesión reciente» ≠ «Google acaba de autenticar»:** una sesión de Google creada hace 5 minutos cumple aunque Google no haya vuelto a pedir la contraseña. Se acepta; la alternativa F lo endurece si el equipo lo pide.
- **Dos dispositivos:** al crear o cambiar la contraseña se cierran las otras sesiones de la persona (puede sorprender; es lo seguro).

## Decisiones que quedan para el equipo

- Confirmar los 10 minutos de reautenticación (`RECENT_SESSION_MINUTES`), la vigencia de 1 hora (`PASSWORD_RESET_TTL_HOURS`) y los límites (`FORGOT_PER_IP`, `FORGOT_PER_EMAIL`, `RESETS_PER_IP`).
- Si se quiere avisar por correo «tu contraseña cambió» (hoy no se envía; requiere el proveedor de correo).
- Revisión jurídica del texto de la política (menciona el correo de restablecimiento).
