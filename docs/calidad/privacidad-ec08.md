# Privacidad de la API y la base de datos (EC-08)

- **Requisitos:** EC-08, RNF-007, PR-15, Ley 1581 de 2012.
- **Issue:** #36. Fecha: 15 de noviembre de 2026.
- **Cómo se reproduce:** `corepack pnpm exec jest test/integration/privacy-schema.spec.ts test/integration/privacy-public-responses.spec.ts --runInBand`.

## Resultado

| Criterio de la #36 | Resultado | Evidencia |
|---|---|---|
| 0 datos personales en respuestas públicas | Cumple | `privacy-public-responses.spec.ts` |
| 0 coordenadas de usuarios guardadas | Cumple | `privacy-schema.spec.ts`; `comparison-http.spec.ts` y `establishments-http.spec.ts` («la ubicación consultada no aparece en la respuesta ni en el log, y no se guarda») |
| Datos del reportante en un esquema separado (PR-15) | Cumple, con una referencia interna documentada | `privacy-schema.spec.ts`; hallazgo 1 |

## Qué datos personales guarda Valora y dónde

| Dato | Dónde | Para qué |
|---|---|---|
| Correo | `identity.accounts.email` | Iniciar sesión. |
| Nombre visible | `identity.accounts.display_name` (vacío en las cuentas creadas antes de la #133) | Saludar a la persona en su propia sesión («Hola, Sara»). Solo lo devuelve `GET /v1/auth/session` de esa cuenta; ninguna otra respuesta, ni la moderación, lo incluye (`privacy-public-responses.spec.ts`). |
| Fecha de verificación del correo | `identity.accounts.email_verified_at` (vacía = sin verificar) | Exigir correo comprobado para registrar precios (ADR-029). Solo la dice `GET /v1/auth/session` de esa cuenta (`emailVerified`, un booleano); ninguna otra respuesta. |
| Enlaces de verificación (hash del token, cuenta, vencimiento y uso) | `identity.email_verifications` | Comprobar que la persona controla el correo (ADR-029). Se guarda el SHA-256 del token, nunca el token; vale 24 horas y un solo uso. No repite el correo: se une a la cuenta por `account_id`. |
| Hash de la contraseña (argon2id) | `identity.accounts.password_hash` | Iniciar sesión; nunca la contraseña. |
| Versión y fecha de la política aceptada | `identity.accounts` | Consentimiento (Ley 1581). |
| Sesiones (hash del token) | `identity.sessions` | Sesión de servidor; no guarda IP ni navegador. |
| Clave seudónima del reportante (HMAC del id de la cuenta) | `identity.accounts.reporter_key`; en `reliability` como `reporter_key`, `flagger_key` y `moderator_key` | Reputación, moderación y suspensión sin identificar a la persona (#31, #32, #33). |
| Id de la cuenta que reportó | `pricing.reports.reporter_id` | Idempotencia, duplicados y ráfagas (#14, #29). Ver hallazgo 1. |
| Cambios de rol | `identity.role_changes` (ids, sin correo) | Bitácora inmutable (#73). |
| Causa de la suspensión | `identity.accounts.suspension_reason` (ADR-039) | Explicarle a la propia cuenta por qué está suspendida. Es un código de un conjunto estable (`observada_por_moderacion`, `descartes_seguidos`, `no_registrada`), nunca la nota del moderador ni quién denunció. Solo la dice `GET /v1/auth/session` de esa cuenta en `suspension.reason` (`identity-suspension.spec.ts`). |
| Fecha de eliminación pendiente | `identity.accounts.deletion_scheduled_for` | Gracia de 10 días antes de borrar la cuenta (ADR-032). Solo sale como `scheduledFor` para quien la pidió o quien acierta su contraseña. |

**Ubicación:** la única columna geográfica es `establishments.establishments.location`, la ubicación pública de la tienda. La ubicación del usuario solo viaja como parámetro de la consulta (`/nearby`, la comparación y la canasta básica de hoy, B#128) y no se guarda.

## Qué expone cada ruta pública

| Ruta | Datos de personas que expone |
|---|---|
| `GET /v1/health` | Ninguno. |
| `GET /v1/products`, `GET /v1/products/{productId}` | Ninguno (solo catálogo). |
| `GET /v1/products/{productId}/comparison` | Ninguno. Lleva `reportId` del precio, sin autor. `no-store` porque la URL lleva la ubicación. |
| `GET /v1/featured-products` | Ninguno. Solo el producto, sus precios más bajo y más alto y el nombre de la tienda; sin `reportId` ni autor (B#120). Con la ubicación, `no-store` y la distancia de la tienda, nunca la ubicación consultada (B#128). |
| `GET /v1/establishments/nearby` | Ninguno. `no-store` por la misma razón. |
| `GET /v1/establishments` | Ninguno (solo el directorio de tiendas). Sirve para elegir la tienda sin compartir la ubicación (#116). |
| `GET /v1/establishments/{establishmentId}/prices` | Ninguno. Lleva `reportId`, sin autor. |
| `POST /v1/auth/register`, `POST /v1/auth/login` | No dicen si un correo existe (#16). Con un correo ya registrado el registro no envía ningún mensaje y responde igual (EC-08). |
| `POST /v1/auth/verify-email` | Ninguno. Un token desconocido, vencido o usado responde igual (422 `INVALID_VERIFICATION_TOKEN`); no devuelve el correo ni la cuenta (ADR-029). |
| `POST /v1/auth/restore-account` | Ninguno. Con un correo inexistente, una contraseña mala o una cuenta no pendiente responde el mismo 401 genérico del login (ADR-032). |
| `POST /v1/auth/forgot-password` | Ninguno. Responde siempre 202 sin cuerpo, exista o no la cuenta (o esté pendiente de eliminación), y los límites cuentan igual en ambos casos; no devuelve el correo, el token ni el hash (ADR-033). |
| `POST /v1/auth/reset-password` | Ninguno. Un token desconocido, vencido o usado responde igual (422 `INVALID_TOKEN`); no devuelve el correo ni la cuenta, y no abre sesión (ADR-033). |
| `POST /v1/me/password` | Ninguno (204 sin cuerpo; 403 `INVALID_PASSWORD` o `REAUTH_REQUIRED` genéricos) (ADR-033). |
| `POST /v1/auth/resend-verification` | Ninguno. Reenvía a la cuenta de la sesión, nunca a un correo recibido, y responde igual si ya estaba verificada (ADR-029). |

**Notas internas de moderación (ADR-039).** La nota que escribe un moderador al decidir (`moderation_log.note` en los reportes de precio; `merchant_cases.note` y el motivo guardado al revocar en los casos de comercio) puede nombrar a quien denunció. Es interna: queda en la bitácora y ninguna respuesta a la cuenta afectada la devuelve. `GET /v1/commerce/me` de una cuenta revocada trae un mensaje estándar (`commerce-cases-http.spec.ts`); el motivo del moderador solo se conserva al rechazar una tienda propuesta (B2). `GET /v1/establishments/{id}/merchant-reports` dice `alreadyReported` solo a quien denunció, sobre su propia denuncia.

Las rutas con sesión tampoco devuelven el correo: `GET /v1/auth/session` da el rol, si el correo está verificado (`emailVerified`) y el token CSRF; la cola de moderación y el estado de un aporte no dicen quién reportó, quién marcó ni quién decidió (#32, #71, #76). Los eventos internos llevan solo la clave seudónima (#31, #33, #29).

## Qué guardan los registros

- No hay registro de peticiones: ni la URL (con la ubicación) ni la IP se escriben.
- Se registran los errores inesperados con su traza (filtro de errores y repartidor del outbox), sin el cuerpo de la petición.
- **Correo de restablecimiento (ADR-033).** Lleva solo el enlace y un aviso, sin nombre ni contraseña. El token nunca se escribe en los registros; si el envío falla, el aviso del servidor no lleva el correo ni el token. `identity.password_resets` guarda solo el hash del token y fechas (sin correo ni IP).
- **Correo de bienvenida (ADR-036).** Informativo, una vez por cuenta, al verificar el correo por primera vez. Lleva el primer nombre y enlaces a la PWA y a `/privacidad`; sin contraseña, token, ubicación ni enlaces de baja. `identity.accounts.welcome_email_sent_at` es solo una fecha, nunca sale en una respuesta y se borra con la cuenta en la purga (ADR-032). Si el envío falla, el aviso del servidor no lleva correo ni nombre. Vista de ejemplo, sin datos reales: `docs/correos/bienvenida.html`.
- **Correo de verificación (ADR-029).** El mensaje lleva solo el enlace y un aviso, sin contraseña ni nombre. El proveedor de correo (Resend, con `EMAIL_PROVIDER=resend`) recibe el correo del destinatario para poder entregarlo: es un encargado más del tratamiento y se declara en la política (sección 5) y en `docs/privacidad.md`. Los avisos de error del envío no llevan el correo, el token ni la clave. Con `EMAIL_PROVIDER=console`, solo en desarrollo y pruebas, el enlace y el destinatario salen en el registro del servidor; en producción `ConsoleEmailSender` no escribe ni el enlace ni el destinatario.
- Los comandos del administrador escriben en su consola: `pnpm db:seed` (filas del CSV) e `identity:set-role`, que muestra el correo de la cuenta cambiada. Es la consola de quien administra el servidor, no un registro público.

## Supresión de la cuenta (ADR-032)

El derecho de supresión es automático: `POST /v1/me/account-deletion` programa el borrado a 10 días y una purga interna lo ejecuta. Qué se borra y qué se conserva está en `docs/privacidad.md` («Supresión de la cuenta»). Resumen para EC-08: se borran el correo, el nombre, el hash, las sesiones, los enlaces de verificación y de restablecimiento de contraseña y la clave seudónima (la única unión entre persona y clave); se conservan los reportes, la reputación, las propuestas, las marcas y las bitácoras, que solo llevan ids internos y claves seudónimas. Las respuestas (202, 403 `ACCOUNT_PENDING_DELETION`) no traen correo, nombre, hash ni id.

## Dejar y eliminar la tienda (ADR-040)

Dejar la tienda borra la solicitud del comercio (nombre del responsable, NIT y teléfono), sus avisos enviados, sus precios oficiales y sus promociones; no se guarda un historial de la salida en `commerce`. En `identity.role_changes` queda el cambio a reportante (ids, sin correo). Los casos de moderación cerrados conservan solo claves seudónimas. El dato nuevo `commerce.merchant_claims.created_establishment` es un booleano que se borra con la solicitud. Eliminar la tienda no borra datos: la marca `retirada` y sus reportes quedan ocultos. Ninguna respuesta nueva trae datos de personas (solo el id de la tienda). La purga de la cuenta (ADR-032) funciona igual después de dejar o eliminar la tienda (`commerce-leave-http.spec.ts`).

## Hallazgos

1. **`pricing.reports.reporter_id` guarda el id de la cuenta fuera de `identity`.** Tras la supresión de la cuenta (ADR-032) queda como un UUID huérfano, sin persona detrás. Es un UUID sin correo ni nombre, que `pricing` usa para la idempotencia, el duplicado y la ráfaga. Nunca sale en respuestas ni eventos (lo verifican `privacy-public-responses.spec.ts`, `reports-http.spec.ts` y las pruebas de punta a punta). Se deja así (grill de la #36, pregunta 1). Cambiarlo por la clave seudónima pediría una migración que recalcule claves con el secreto.
2. **`identity:set-role` muestra el correo en la consola del administrador.** Es intencional: confirma a quién se le cambió el rol.

## Pruebas guardianas

- `privacy-schema.spec.ts` falla si una migración agrega correo o contraseña fuera de `identity`, una columna de coordenadas fuera de la tienda, una columna de IP o una referencia a la cuenta fuera de `identity` y `pricing.reports`.
- `privacy-public-responses.spec.ts` recorre las rutas públicas con una cuenta que reportó y otra que marcó, y falla si alguna respuesta trae su correo, su id, su clave seudónima o la ubicación consultada. Una ruta pública nueva debe agregarse a esa lista.
- `privacy-schema.spec.ts` también falla si la eliminación pendiente guarda algo más que una fecha en `identity.accounts`; `account-deletion-http.spec.ts` comprueba que ni la solicitud ni el login de una cuenta pendiente traen correo, nombre, hash o id, y que tras la purga los reportes siguen en la comparación sin datos personales.
- `password-reset-http.spec.ts` y `privacy-schema.spec.ts` (ADR-033) fallan si `identity.password_resets` gana columnas distintas del hash del token y fechas, si el token en claro aparece en alguna columna o si alguna respuesta de las rutas de contraseña trae el correo, el token o su hash; `account-deletion-http.spec.ts` comprueba que la purga borra esos enlaces.
- `welcome-email-http.spec.ts` y `privacy-schema.spec.ts` (ADR-036) fallan si `welcome_email_sent_at` aparece fuera de `identity.accounts`, deja de ser una fecha, o si la respuesta de la sesión la trae.
- `email-verification-http.spec.ts` y `privacy-schema.spec.ts` (ADR-029) fallan si el token de verificación se guarda en claro en alguna columna de `identity`, si la tabla `identity.email_verifications` gana otras columnas, o si alguna respuesta de las rutas de verificación y de la sesión trae el correo o el token.
