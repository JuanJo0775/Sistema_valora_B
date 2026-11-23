# ADR-032: Eliminación de la propia cuenta: borrado definitivo con 10 días de gracia

- **Estado:** Aceptado (decisión del equipo, registrada el 23-nov-2026)
- **Fecha:** 2026-11-18
- **Responsables:** integrante que dirige el backend; revisado por el equipo.
- **Escenarios relacionados:** EC-08 (privacidad)
- **Requisitos relacionados:** RNF-007, PR-15, Ley 1581 de 2012 (art. 8, derecho de supresión), ADR-013 (privacidad por diseño), ADR-014 (sesiones), ADR-029 (identidad propia)

## Contexto

Hasta ahora el derecho de supresión era un procedimiento manual (`docs/privacidad.md`, pendiente 3): alguien del equipo borraba la fila de `identity.accounts` y sus sesiones. La persona debe poder eliminar su cuenta desde la app, sin depender de nadie.

Qué cuelga de una cuenta (revisado en el código):

- En `identity`: la fila `accounts` (correo, nombre, hash de la contraseña, consentimiento, `reporter_key`), `sessions` y `email_verifications` (con llave foránea a la cuenta), y `role_changes`, la bitácora inmutable, que no tiene llave foránea a propósito (ids, sin correo).
- Fuera de `identity` no hay datos personales. Los reportes de precios guardan `pricing.reports.reporter_id` (el id interno de la cuenta, sin correo ni nombre). El resto de módulos usa la **clave seudónima** `reporter_key = HMAC-SHA256(REPORTER_KEY_SECRET, id de la cuenta)`: `reliability` (observaciones, reputación, marcas con `flagger_key`, bitácora de moderación con `moderator_key`), las propuestas de producto (`requester_key`) y de tienda (`proposer_key`).
- El único lugar que une la clave seudónima con una persona es `identity.accounts` (`reporter_key` junto al correo). No hay otra tabla que mapee cuenta a clave.

## Decisión

1. **`POST /v1/me/account-deletion`** (sesión + CSRF, cuerpo `{ password }`) comprueba la contraseña, marca la cuenta con `deletion_scheduled_for = ahora + 10 días`, revoca todas sus sesiones, limpia la cookie y responde **202** `{ scheduledFor }`. Pedirla otra vez no mueve la fecha. Cualquier rol puede pedirla, también una cuenta suspendida.
2. **Período de gracia de 10 días.** Durante ese lapso la cuenta no abre sesión: el login con la contraseña correcta responde 403 `ACCOUNT_PENDING_DELETION` con `scheduledFor` (con una contraseña incorrecta, el 401 genérico de siempre, sin revelar nada); registrarse con ese correo responde como con cualquier correo en uso y no crea nada. **`POST /v1/auth/restore-account`** (`{ email, password }`, pública como el login) cancela la eliminación y deja la sesión iniciada con la misma respuesta y cookie del login; comparte con el login los límites de intentos.
3. **Purga.** Un trabajo interno, `PurgeDeletedAccounts`, corre una vez al arrancar el servidor y cada hora (intervalo propio dentro del proceso, como el repartidor del outbox, ADR-015) y borra las cuentas con `deletion_scheduled_for <= ahora`. Cada cuenta va en su propia transacción: borra sus sesiones y enlaces de verificación y después la fila de la cuenta, y vuelve a comprobar con `FOR UPDATE` que sigue pendiente y vencida (si la persona la restauró en ese instante, no se borra). Es idempotente y tolera fallos parciales: una cuenta que falla se reintenta en la siguiente pasada sin impedir las demás. Como el plan gratuito de Render duerme el servicio, la purga puede retrasarse unas horas; **nunca se adelanta**, porque usa la fecha guardada.
4. **Qué se borra:** la fila de `identity.accounts` (correo, nombre, hash, consentimiento, `reporter_key`), `identity.sessions` e `identity.email_verifications`. Con la fila desaparece el único vínculo entre la persona y su clave seudónima.
5. **Qué se conserva, sin ningún dato personal:**
   - los **reportes de precios** y su historial (la comunidad depende de ellos), con `reporter_id` como identificador interno que ya no corresponde a ninguna cuenta;
   - las **observaciones, la reputación y las marcas** de `reliability`, las **propuestas** de producto y de tienda pendientes o decididas y la **bitácora de moderación**, todas con la clave seudónima;
   - la bitácora `identity.role_changes` (ids sin correo; es inmutable por diseño, #73).
6. **La reputación no se puede volver a ligar a una persona.** La clave es un HMAC del id con un secreto que solo vive en el servidor, y el id ya no está en ninguna cuenta. Quien se registre de nuevo con el mismo correo recibe un id nuevo (UUID aleatorio) y, por tanto, otra clave y reputación neutra. No se borran las filas de `reliability` (ni se emite evento para ello): sin cuenta son un seudónimo huérfano.
7. **Moderadores.** Se bloquea al **último** moderador activo (403 `LAST_MODERATOR_CANNOT_DELETE`), no a todos: los moderadores son pocos y deben poder irse, pero la plataforma no puede quedarse sin quien decida la cola. «Activo» excluye a los que ya tienen la eliminación pendiente. La comprobación bloquea las filas de todos los moderadores (`SELECT ... FOR UPDATE` en orden de id) dentro de la transacción: dos moderadores que se eliminan a la vez se turnan, uno queda pendiente y el otro recibe el 403.
8. **Seguridad:** contraseña incorrecta, 403 `INVALID_PASSWORD` con el mismo hash de Argon2 verificado y mensaje genérico; límite de 5 fallos por cuenta y 20 intentos por IP en 15 minutos (mecanismo del #16, claves propias), 429 con `Retry-After`. Ninguna respuesta lleva correo, nombre, hash ni id.
9. **Eventos:** no se emite ninguno. Ningún módulo necesita reaccionar (los datos conservados no dependen de la cuenta) y no se inventa un patrón nuevo sobre el outbox (ADR-015).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Borrado duro inmediato (204, sin gracia) | Cumple el derecho en el acto; sin estados intermedios ni trabajo de purga | Un clic o una sesión robada destruye la cuenta sin vuelta atrás; el correo robado de una sesión podría borrar a la persona |
| B. Anonimización (conservar la fila con correo y nombre reemplazados) | Conserva llaves foráneas y la fila | Deja una fila «de la persona» con su hash, fecha de alta y clave seudónima; más difícil de demostrar que no hay vínculo; los hashes de contraseña no deberían sobrevivir |
| C. Período de gracia de 30 días | Más margen para arrepentirse | Más tiempo con datos personales guardados tras pedir su supresión; la ley pide suprimir sin demora (reclamo de 15 días hábiles) |
| **D. Borrado definitivo con 10 días de gracia (elegida)** | Reversible en un lapso corto y claro, dentro del plazo de 15 días hábiles de la Ley 1581; el borrado final no deja nada personal; protege contra solicitudes hechas por error o con una sesión ajena | Un estado intermedio (la cuenta existe, sin sesión) y un trabajo de purga que puede retrasarse unas horas |
| E. Borrar también reputación, propuestas y marcas | Quita hasta el seudónimo | Destruye la moderación y el historial de la comunidad; exige un evento nuevo entre módulos; no mejora la privacidad porque ya no apuntan a nadie |

## Consecuencias y riesgos

- **Datos personales durante la gracia:** la cuenta sigue guardada 10 días; la persona lo sabe (el 202 y el 403 le dicen la fecha) y puede restaurarla o pedir al responsable la supresión inmediata por el canal de `/privacidad`.
- **Evasión de sanciones:** una cuenta suspendida puede eliminarse y registrarse de nuevo con otro correo, o con el mismo después de la gracia, y vuelve con reputación neutra. Se acepta: el derecho de supresión pesa más. La moderación puede observar patrones por reportes, no por personas.
- **Copias de respaldo:** Neon conserva historial de la base durante su ventana de recuperación; los datos borrados pueden persistir ahí hasta que expire. También el proveedor de correo (Resend) conserva su registro de los mensajes de verificación. Ambos son encargados del tratamiento y se declaran en la política; hay que revisar su retención.
- **Seudónimo agrupable:** los reportes de una misma persona siguen compartiendo `reporter_id` y clave; se pueden agrupar entre sí, pero no vincular con una persona. Quien tuviera además el secreto y una copia vieja de la base podría reconstruir la relación id-clave, no la persona.
- **Moderador restaurado o que queda solo en la gracia:** si, ya programada la eliminación de un moderador, el otro deja de serlo antes de la purga, la plataforma puede quedar sin moderadores; se repara con `pnpm identity:set-role`. No se frena la purga: no se puede retener a alguien que ejerció su derecho.
- **Límites en memoria:** como los del login, se reinician con el servidor (riesgo ya aceptado en #16).
- **Una sola copia del servicio:** la purga corre en el proceso; con varias copias dos purgas simultáneas serían inocuas (transacción por cuenta con `FOR UPDATE`).

## Decisiones que quedan para el equipo

- Confirmar los 10 días (constante `ACCOUNT_DELETION_GRACE_DAYS`, un solo lugar) frente a los 15 días hábiles de la Ley 1581 para atender reclamos.
- Si se quiere que la persona reciba un correo al pedir la eliminación y antes de que se ejecute (hoy no se envía ninguno: requiere el proveedor de correo, ADR-029).
- Revisión jurídica del texto de la política, que debe describir la gracia y lo que se conserva (ver `docs/privacidad.md`).
