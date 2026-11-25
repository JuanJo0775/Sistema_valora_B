# Política de tratamiento de datos y cookies: cumplimiento legal (Colombia)

**Versión de la política:** 2026-11 (vigente desde el 17 de noviembre de 2026).
**Texto público:** la ruta `/privacidad` de la PWA (`Sistema_valora_F`, `src/features/legal/PrivacyPolicy.tsx`).
**Versión aceptada:** el registro exige `acceptedPolicyVersion = 2026-11` (`src/modules/identity/application/policy.ts`); si el texto cambia de fondo, se sube la versión en los dos repositorios.

Redactado con apoyo de IA (Claude Code). **No es asesoría jurídica:** el equipo debe revisarlo y, si el sistema se abre al público, validarlo con un abogado y con la universidad.

## Normas aplicadas

- Ley 1581 de 2012 (régimen general de protección de datos personales) y Decreto 1074 de 2015, que compiló el Decreto 1377 de 2013 (autorización, política de tratamiento, aviso de privacidad).
- Ley 1266 de 2008 (habeas data financiero): no aplica; Valora no trata información crediticia.
- Ley 1480 de 2011 (consumidor): informa las condiciones de las promociones (módulo comercial, corte 3); no cambia esta política.
- Circular Única de la SIC (Título V), para transferencias y transmisiones internacionales y el Registro Nacional de Bases de Datos.

## Qué exige la ley y dónde está cubierto

| Exigencia | Dónde se cumple |
|---|---|
| Política de tratamiento con responsable, finalidades, derechos, área de peticiones, procedimiento y vigencia (art. 13, Decreto 1377/2013) | `/privacidad`, secciones 1 a 10 |
| Autorización previa, expresa e informada y prueba de ella (arts. 9 y 17 de la Ley 1581) | Casilla sin marcar en «Crear cuenta»; el servidor guarda la versión y la fecha aceptadas (`identity.accounts`) |
| Aviso de privacidad en el momento de la captura (art. 14, Decreto 1377/2013) | Párrafo sobre el formulario de registro |
| Derechos del titular (art. 8): conocer, actualizar, rectificar, prueba de autorización, informe de uso, queja ante la SIC, revocar y suprimir, acceso gratuito | `/privacidad`, sección 6 |
| Plazos: consulta 10 días hábiles (+5); reclamo 15 días hábiles (+8) (arts. 14 y 15) | `/privacidad`, sección 7 |
| Datos sensibles y de menores (arts. 5, 6 y 7) | No se tratan datos sensibles; sección 9 sobre menores |
| Principio de finalidad, necesidad y circulación restringida (art. 4) | ADR-013 y `docs/calidad/privacidad-ec08.md`: datos mínimos, identidad separada, respuestas públicas sin datos personales |
| Seguridad (art. 4, literal g) | Contraseñas con argon2id, cookies HttpOnly + CSRF, HTTPS, esquema separado, pruebas guardianas `privacy-schema.spec.ts` y `privacy-public-responses.spec.ts` |
| Transmisión y transferencia internacional (art. 26 y Decreto 1377/2013, art. 25) | Sección 5: proveedores en EE. UU. como encargados; Estados Unidos figura entre los países con nivel adecuado según la SIC |
| Aviso de cookies | Aviso inferior de la PWA (`CookieNotice`) y sección 4. Solo se usan cookies y almacenamiento necesarios; no requieren aceptación, pero se informan |
| Rectificación del nombre (art. 8, actualizar y rectificar) | La persona puede cambiar su nombre desde la app (`PATCH /v1/me/profile`, sin contraseña, hasta 10 veces por hora); solo lo ve su dueña y no sale en respuestas públicas ni en registros |

## Pendientes del equipo (`PENDIENTE (equipo)`)

1. **Canal de contacto del responsable.** El Decreto exige indicar domicilio, dirección, correo y teléfono. La política remite hoy al repositorio de GitHub; hay que definir un correo del proyecto y publicarlo en `/privacidad` (sección 1).
2. **Identidad del responsable.** Confirmar si el responsable es el equipo, cada integrante o la universidad, según su política de propiedad intelectual y de datos.
3. **Procedimiento de supresión.** Automatizado desde ADR-032 (ver «Supresión de la cuenta» abajo). Pendiente del equipo: confirmar el plazo de gracia de 10 días, revisar la retención de las copias de respaldo de Neon y del proveedor de correo, y que el texto público de `/privacidad` (sección 6) describa la gracia y lo que se conserva.
4. **Registro Nacional de Bases de Datos (RNBD).** Obligatorio para responsables con activos totales superiores a 100.000 UVT y para entidades públicas; un proyecto académico probablemente no lo es. Confirmarlo antes de abrir al público.
5. **Retención.** La política dice «mientras la cuenta esté activa y por el tiempo que dure el proyecto». Fijar un plazo concreto y una limpieza al cerrar el proyecto.
6. **Menores de edad.** La política pide autorización del representante legal. Si el equipo prefiere vetarlos, hay que pedir la fecha de nacimiento o una declaración de mayoría de edad en el registro.
7. **Incidentes de seguridad.** Definir quién avisa a la SIC (Registro Nacional de Bases de Datos, módulo de incidentes) y en cuántas horas.
8. **Revisión jurídica** del texto antes de producción.

## Supresión de la cuenta (derecho del art. 8 de la Ley 1581; ADR-032)

Desde la app, sin intervención del equipo: la opción de eliminar la cuenta, con la contraseña. En el API, `POST /v1/me/account-deletion`.

**1. Solicitud.** Se comprueba la contraseña (límite de 5 fallos por cuenta y 20 intentos por IP en 15 minutos). La cuenta queda **pendiente de eliminación** y se cierran todas sus sesiones; la respuesta dice la fecha en que se borrará (ahora más 10 días).

**2. Durante los 10 días de gracia.** La cuenta existe pero no puede abrir sesión: iniciar sesión con la contraseña correcta responde que está pendiente de eliminación y la fecha, sin crear sesión. No puede registrar precios ni hacer nada. La persona puede **restaurarla** con su correo y contraseña (`POST /v1/auth/restore-account`) y queda con la sesión iniciada. Con una contraseña incorrecta nadie sabe que la cuenta existe ni su estado. Registrarse de nuevo con ese correo no crea nada: se trata como un correo en uso.

**3. Purga.** Pasados los 10 días, un trabajo interno borra la cuenta de forma definitiva, en una transacción por cuenta. Corre al arrancar el servidor y cada hora. Como Render gratuito duerme el servicio, el borrado puede retrasarse unas horas respecto de la fecha; **nunca se adelanta**. Es idempotente y, si falla para una cuenta, se reintenta en la pasada siguiente.

| Se borra | Se conserva (sin ningún dato personal) |
|---|---|
| `identity.accounts`: correo, nombre, hash de la contraseña, versión y fecha de la política aceptada, fecha de verificación, suspensión y la clave seudónima (`reporter_key`) | Los **reportes de precios** y su historial (`pricing.reports`, solo con un identificador interno que ya no corresponde a ninguna cuenta), porque la comunidad depende de ellos |
| `identity.sessions`: todas las sesiones | La **reputación**, las observaciones y las **marcas** de `reliability`, las **propuestas** de producto y de tienda y la bitácora de moderación, todas con la clave seudónima |
| `identity.email_verifications` e `identity.password_resets`: los enlaces de verificación y de restablecimiento de contraseña | La bitácora inmutable de cambios de rol (`identity.role_changes`: ids, sin correo) |

**Disputas de comercio (H18).** También se borran los datos del responsable que la cuenta escribió al disputar una tienda (`commerce.dispute_challengers`); el caso queda solo con la clave seudónima.

**Por qué lo que se conserva no identifica a nadie.** La clave seudónima es `HMAC-SHA256(REPORTER_KEY_SECRET, id de la cuenta)`. La única tabla que la unía a una persona era `identity.accounts`, que se borra. Sin la cuenta no hay correo ni nombre al que llegar, y quien se registre de nuevo con el mismo correo recibe un id nuevo, otra clave y reputación neutra. Los reportes de una misma persona siguen pudiendo agruparse entre sí (es un seudónimo), pero no vincularse con ella.

**Salvedades.** Los respaldos de la base (Neon) y los registros del proveedor de correo (Resend) conservan datos hasta que vence su retención. Un moderador no puede eliminar su cuenta si es el último (403 `LAST_MODERATOR_CANNOT_DELETE`). Una cuenta suspendida también puede eliminarse y volver a registrarse sin la suspensión; el derecho de supresión pesa más.

**Contraseña olvidada y creada desde la sesión (ADR-033).** `POST /v1/auth/forgot-password` guarda en `identity.password_resets` solo el hash SHA-256 de un token aleatorio y sus fechas (vence en 1 hora, un solo uso, un enlace vigente por cuenta); el token viaja únicamente en el correo y no se escribe en registros. Responde igual exista o no la cuenta y no envía nada si está pendiente de eliminación. Al restablecer se cierran todas las sesiones y el correo queda verificado. Una cuenta creada con Google puede crear su primera contraseña con ese enlace o con `POST /v1/me/password` (sesión de 10 minutos o menos). Entrar de nuevo con Google durante los 10 días de gracia restaura una cuenta de Google pendiente de eliminación.

**Correo de bienvenida (ADR-036).** Al verificar el correo por primera vez, la cuenta recibe un único correo informativo de bienvenida (qué es Valora y tres pasos para empezar). Base legal: ejecución del servicio que la persona solicitó al crear la cuenta; no es promoción, no lleva enlaces de baja ni de seguimiento. Usa el correo y el primer nombre de la cuenta y los entrega el mismo proveedor de correo ya declarado (sección 5 de `/privacidad`). `identity.accounts.welcome_email_sent_at` guarda solo la fecha de envío para no repetirlo; la purga de la cuenta la borra con la fila.

**Pruebas:** `test/integration/account-deletion-http.spec.ts` (solicitud, gracia, restauración, purga con reloj controlado, transacción, concurrencia, moderador único y límite), los casos de uso en `src/modules/identity/application`, `privacy-schema.spec.ts` y las pruebas de contrato y del guardián de rutas.

## Qué datos y cookies usa realmente el sistema

Ver `docs/calidad/privacidad-ec08.md` (datos y rutas) y `docs/despliegue.md` (proveedores). Cookies: sesión (HttpOnly) y CSRF; almacenamiento local para preferencias (`valora:*`) y IndexedDB para la cola sin conexión. No hay analítica, publicidad ni terceros que pongan cookies.
