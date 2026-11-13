# Grill — issue #16: sesión, CSRF y roles

- **Fuentes:**
  - Issue #16 (paso 7 del H2-01, épica #1): registro, inicio y cierre de sesión con cookie HttpOnly, Secure y SameSite, CSRF y Argon2id (ADR-014). Pide decidir antes la expiración y la rotación de la sesión. Criterios: `POST /v1/reports` exige sesión y la comparación sigue pública; pruebas de acceso permitido y denegado por rol; ninguna respuesta pública expone datos personales.
  - Comentario en #1: expiración por inactividad y absoluta, rotación del id al iniciar sesión, revocación al cerrar sesión o bloquear una cuenta; 401 y 403 con el formato común, sin revelar si una cuenta existe.
  - `docs/PLAN_MAESTRO.md`: la estrategia de ADR-014 está aceptada; la expiración, la rotación y la revocación se concretan como diseño, sin reinterpretarla.
  - RF-001 (cuenta con consentimiento, Ley 1581), RF-002 (roles); EC-08 (privacidad).
  - `docs/openapi.yaml`: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/session`, esquemas `sessionCookie` (cookie `valora_session`) y `csrfToken` (cabecera `X-CSRF-Token`).
  - Código existente: `SESSION_SECRET` ya se valida al arrancar; `pricing.reports.reporter_id` es opcional desde la #14 («la #16 lo vuelve obligatorio»).
  - Issues relacionadas: #29 (límites de frecuencia y 429), #17 (prueba de extremo a extremo).
- **Fecha:** 2026-11-12.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Alcance:** cuentas, sesión, CSRF, roles y proteger `POST /reports` son mucho para un solo pull request.
2. **Dónde vive la sesión:** tabla propia en `identity`, qué guarda la cookie y qué se guarda en la base.
3. **Ciclo de vida:** expiración por inactividad y absoluta, rotación del id y revocación.
4. **CSRF:** cómo se genera, dónde se guarda, qué rutas lo exigen y si el inicio de sesión también.
5. **Roles:** cómo se asigna `reportante`, `comercio` y `moderador`, y quién puede reportar.
6. **Enumeración de cuentas:** qué responden el registro con un correo existente y el inicio de sesión fallido, incluido el tiempo de respuesta.
7. **Contraseña y correo:** longitud mínima y máxima, normalización del correo, parámetros de Argon2id.
8. **`reporter_id` obligatorio:** la migración falla si ya hay reportes sin reportante en `valora_dev`.
9. **Cookie en desarrollo:** `Secure` exige HTTPS, y el frontend puede estar en otro origen (CORS con credenciales).
10. **Límites de frecuencia:** el contrato pide 429 en registro e inicio de sesión. ¿Aquí o en la #29?
11. **Dependencias nuevas:** Argon2id y la lectura de cookies.

## Preguntas

### 1. ¿Uno o dos pull requests?

- **Decisión:** dos, en orden.
  1. **Cuentas y sesión** (módulo `identity`): registro con consentimiento, inicio y cierre de sesión, `GET /auth/session` con su token CSRF, y el guard de sesión, CSRF y rol con pruebas de permitido y denegado.
  2. **Proteger `POST /v1/reports`:** exige sesión y CSRF, `reporter_id` pasa a obligatorio con su migración, y se comprueba que la comparación sigue pública.
- **Razón:** es seguridad, donde un error cuesta más, y la #16 completa sería el pull request más grande del proyecto. Dos más pequeños se revisan mejor; el segundo además toca otro módulo (`pricing`).
- **Consecuencia:** se abre una issue nueva para la segunda parte; la #16 se cierra con el segundo pull request. Este grill decide las dos.

### 2. ¿Dónde vive la sesión?

- **Decisión:** en una tabla propia, `identity.sessions`: `id`, `token_hash` (único), `account_id`, `created_at`, `last_seen_at`, `expires_at` y `revoked_at`. La cookie `valora_session` lleva solo un token aleatorio de 256 bits; la base guarda su hash SHA-256, nunca el token. El token CSRF se deriva del token de sesión con un HMAC y `SESSION_SECRET` (pregunta 4), sin columna.
- **Razón:** poco código, sigue el patrón del monolito (un esquema por módulo, Drizzle y migraciones) y deja el ciclo de vida a la vista y probado. Si se filtra una copia de la base, las sesiones no se pueden usar. `express-session` con `connect-pg-simple` crearía una tabla fuera de `identity`, guardaría el identificador en claro y agregaría dos dependencias que igual habría que configurar y probar.

### 3. ¿Cuándo vence, rota y se revoca una sesión?

- **Decisión:**
  - **Inactividad:** 7 días; cada uso la extiende. `last_seen_at` se actualiza como mucho una vez cada 5 minutos.
  - **Absoluta:** 30 días desde el inicio de sesión.
  - **Rotación:** cada inicio de sesión crea una sesión y un token nuevos; nunca se reutiliza una cookie anterior (sin fijación de sesión). Rotará también con el cambio de rol, cuando exista.
  - **Revocación:** cerrar sesión marca `revoked_at` y borra la cookie. Bloquear una cuenta revocará todas sus sesiones cuando el bloqueo exista.
  - La regla «la sesión sigue activa» va en `src/domain/session-lifetime.ts`, pura y con TDD. Los 7 y 30 días son constantes provisionales, como los TTL de ADR-005.
  - Sin limpieza de sesiones vencidas por ahora (YAGNI): una sesión vencida no sirve aunque siga en la tabla.
- **Razón:** el reportante trabaja a veces sin conexión y su cola se envía después (ADR-010). Una expiración corta (30 minutos, 1 día) obligaría a iniciar sesión casi en cada visita a la tienda y bloquearía la cola. El máximo de 30 días limita el daño de una cookie robada.

### 4. ¿Cómo funciona el CSRF?

- **Decisión:** token sincronizado y derivado: `csrfToken = HMAC-SHA256(SESSION_SECRET, token de sesión)` en base64url, sin guardarlo. `GET /auth/session` lo entrega; el frontend lo guarda en memoria. Lo exigen las rutas con sesión y método `POST`, `PUT`, `PATCH` o `DELETE` (por ejemplo `POST /auth/logout` y, en el segundo pull request, `POST /reports`). Se compara en tiempo constante; si falta o no coincide, responde 403 `CSRF_TOKEN_INVALID`. Registro e inicio de sesión no lo exigen (aún no hay sesión): los protegen la cookie `SameSite` y que el cuerpo deba ser JSON.
- **Razón:** el token rota con la sesión, nadie puede calcularlo sin `SESSION_SECRET` y no agrega dependencias ni columnas. La doble cookie dejaría otra cookie legible por JavaScript y dependería de que ningún subdominio pueda escribir cookies, cuando el contrato ya entrega el token por `/auth/session`.

### 5. ¿Cómo se asignan los roles y quién puede reportar?

- **Decisión:** un rol por cuenta, en la columna `role` de `identity.accounts` con `CHECK` (`reportante`, `comercio`, `moderador`). El registro siempre crea un `reportante`; el cuerpo no trae rol. `moderador` y `comercio` no se crean desde la API por ahora (llegan con la moderación y con el corte 3); en las pruebas se crean en la base. Solo el `reportante` puede registrar precios. El guard usa `@Roles(...)`: sin sesión responde 401 `UNAUTHORIZED`; con un rol no permitido, 403 `FORBIDDEN`. En el primer pull request, las pruebas de permitido y denegado usan una ruta que existe solo en el módulo de pruebas; en el segundo, `POST /reports`.
- **Razón:** nadie necesita dos roles a la vez (YAGNI). Un comercio que reporta como comunidad rompería la neutralidad (EC-06): sus precios llegan como `oficial` por otra vía. El moderador revisa, no aporta; mezclar los papeles complicaría la regla de anómalos de la #31.

### 6. ¿Cómo se evita revelar si una cuenta existe?

- **Decisión:** el inicio de sesión fallido siempre responde 401 `UNAUTHORIZED` con «Correo o contraseña incorrectos.», exista o no el correo; si no existe, se verifica la contraseña contra un hash de relleno para que tarde lo mismo. El registro con un correo existente responde 201 igual que uno nuevo, calcula el hash igual y no cambia nada de la cuenta.
- **Razón:** saber que alguien usa Valora ya es un dato personal (EC-08, comentario de la #1). Un 409 `EMAIL_TAKEN` permitiría averiguar correos uno por uno, y los límites de frecuencia llegan con la #29.
- **Costo aceptado:** quien se registra de nuevo con otra contraseña cree que creó una cuenta, y luego su inicio de sesión falla. Se le avisará por correo cuando Valora envíe correos; mientras tanto, el frontend sugiere «si ya tenías cuenta, inicia sesión».

### 7. ¿Qué reglas siguen la contraseña, el correo, Argon2id y el consentimiento?

- **Decisión:**
  - **Contraseña:** de 10 a 128 caracteres, sin reglas de composición.
  - **Correo:** sin espacios y en minúsculas antes de validar y guardar; máximo 254 caracteres; índice único sobre el valor normalizado.
  - **Argon2id:** 19 MiB, 2 iteraciones y 1 hilo (mínimo de OWASP), en un solo lugar para calibrarlo.
  - **Pruebas:** el caso de uso depende de un puerto `PasswordHasher`; las unitarias usan un doble rápido y las de integración Argon2id real.
  - **Consentimiento (RF-001, Ley 1581):** `acceptedPolicyVersion` debe ser la versión vigente, una constante; otra responde 400. Se guardan `policy_version` y `policy_accepted_at`.
- **Razón:** las reglas de composición no mejoran la seguridad (NIST 800-63B); el máximo evita que un cuerpo enorme haga trabajar de más a Argon2id. La normalización hace que `Ana@Correo.com` y `ana@correo.com` sean la misma cuenta. Guardar la versión prueba qué aceptó cada persona y cuándo.
- **Pendiente del equipo:** la versión vigente de la política de datos. Mientras no haya texto, se usa `2026-11` como valor provisional.

### 8. ¿Cómo se vuelve obligatorio `reporter_id`? (segundo pull request)

- **Decisión:** con `CHECK (reporter_id IS NOT NULL) NOT VALID` en `pricing.reports`: se aplica a todo reporte nuevo y no revisa los existentes. Sin llave foránea hacia `identity.accounts`; lo garantiza el guard de sesión. El reportante sigue fuera de `PriceReported` y de toda respuesta (EC-08), con la prueba que ya existe.
- **Razón:** los reportes son de solo inserción y en `valora_dev` puede haber reportes de prueba sin reportante. Un `SET NOT NULL` normal fallaría y obligaría a vaciar la base de cada integrante. Un módulo no depende de las tablas de otro, igual que `pricing` no tiene llaves hacia `catalog`.

### 9. ¿Qué atributos lleva la cookie y desde qué origen se usa?

- **Decisión:** `valora_session` con `HttpOnly`, `Secure` siempre (sin interruptor por entorno), `SameSite=Lax`, `Path=/` y `Max-Age` de 30 días. Mismo origen y sin CORS en el backend por ahora: en desarrollo, el proxy de Vite reenvía `/v1` a `localhost:3000`; en producción, PWA y API bajo el mismo dominio, a confirmar con el despliegue (ADR-012). Si el despliegue usa dominios distintos, CORS con credenciales entra con su propia decisión.
- **Razón:** Chrome y Firefox aceptan cookies `Secure` en `http://localhost`, y un `COOKIE_SECURE=false` es la clase de opción que alguien olvida apagar. `Lax` no envía la cookie en un `POST` de otro sitio, pero sí al abrir un enlace a Valora; con el token CSRF cubre los dos casos. El frontend aún no tiene código: no hay ningún origen que permitir, y una lista mal puesta abre más de lo que protege.

### 10. ¿Los límites de frecuencia de registro e inicio de sesión van aquí?

- **Decisión del equipo:** sí, en el primer pull request (cuentas y sesión), en lugar de una issue aparte.
- **Detalle propuesto:**
  - **Inicio de sesión por correo:** 5 intentos fallidos por correo normalizado en 15 minutos → 429 `TOO_MANY_REQUESTS`, exista o no la cuenta (no revela nada, pregunta 6). Un inicio de sesión correcto reinicia el contador de ese correo.
  - **Por IP:** 20 intentos de inicio de sesión y 10 registros por IP en 15 minutos.
  - **Respuesta:** 429 con el formato común y la cabecera `Retry-After` en segundos.
  - **Dónde se cuenta:** en memoria, detrás de un puerto `AttemptLimiter`, con ventana fija y el reloj como puerto para probarlo con TDD. Un solo despliegue (ADR-001) hace suficiente la memoria; si el despliegue usa varias instancias, se cambia la implementación del puerto por una en base de datos.
  - Los números son provisionales y viven en un solo lugar. El equipo los confirmó el 12 de noviembre.
- **Consecuencia:** al reiniciar el servidor, los contadores vuelven a cero (riesgo aceptado). La IP real detrás de un proxy exige configurar `trust proxy` en el despliegue (ADR-012); queda anotado.

### 11. ¿Qué dependencias nuevas entran?

- **Decisión:** dos.
  - `@node-rs/argon2` para Argon2id.
  - `cookie` para leer (`parse`) y escribir (`serialize`) la cookie. Hoy ya está instalada como dependencia indirecta de Express y pasa a ser directa.
  - El token aleatorio, el SHA-256 y el HMAC salen de `node:crypto`; los límites, de código propio.
- **Razón:** `@node-rs/argon2` trae binarios compilados y no ejecuta scripts de instalación, que pnpm 10 bloquea por defecto; `argon2` exigiría aprobarlos en cada máquina y en la CI. `cookie-parser` sería otro middleware global y pediría `@types/express`, que el proyecto evita con tipos estructurales.
- **Verificación:** al instalar se comprueba que las dos funcionan en Windows y en la CI.

## Resultado

Once decisiones. El contrato está en `contrato-api.md` y el plan en `plan.md`.
