# ADR-029: Verificación de correo en el módulo de identidad propio e inicio con Google después

- **Estado:** Aceptado (17-nov-2026), a petición del equipo
- **Fecha:** 2026-11-17
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-03 (reportes maliciosos), EC-08 (privacidad), EC-05 (el núcleo se extiende sin rediseño)
- **Requisitos relacionados:** RF-001 (registro), RF-002 (roles), RNF-007, RNF-010; ADR-013, ADR-014
- **Registro oficial:** base ADRs de Notion (aceptado el 17-nov-2026).

## Contexto

Hoy cualquiera crea una cuenta con un correo que no se comprueba: se puede registrar el correo de otra persona, y las cuentas desechables facilitan el abuso que EC-03 quiere frenar. Además el equipo quiere permitir iniciar sesión con Google. ADR-014 ya consideró delegar la autenticación en un proveedor externo (alternativa C) y eligió sesión de servidor con cookie y CSRF. El módulo `identity` guarda correo, hash argon2id, rol, política aceptada y clave seudónima, y más de 800 pruebas dependen de él (privacidad, matriz de roles, moderación).

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Seguir con `identity` propio: verificación de correo ahora, Google con OpenID Connect propio después | Conserva ADR-014, la clave seudónima, los roles y las pruebas de privacidad; los datos siguen en Neon; cambio aditivo (EC-05); sin dependencia nueva de plataforma | Hay que construirlo y operarlo: envío de correo, tokens, límites y el flujo OIDC |
| B. Supabase Auth | Verificación y Google ya hechos; 50 mil usuarios activos gratis; ya usamos Supabase para fotos | La cuenta vive en la base de Supabase, no en Neon; el backend debe validar sus JWT; hay que rehacer `identity`, las sesiones, la clave seudónima y sus pruebas; el proyecto gratuito se pausa sin actividad y entonces nadie podría entrar |
| C. Clerk | Lo más rápido: pantallas, verificación y Google listos; 10 mil usuarios activos gratis | Guarda correos y contraseñas en un tercero fuera de Colombia, nos ata a su servicio, sustituye `identity` y exige rehacer la política de datos, las pruebas de privacidad y el control de roles |

## Decisión

Se elige **A**, en dos fases.

### Fase 1: verificación de correo

1. **Datos.** Columna `identity.accounts.email_verified_at` (nula = sin verificar) y tabla `identity.email_verifications` con el **hash** del token, la cuenta, `expires_at` (24 h) y `used_at`. Nunca se guarda el token en claro.
2. **Puerto `EmailSender`** en `identity/application`, con un adaptador de producción por HTTP (`fetch`, sin dependencias nuevas) y `ConsoleEmailSender` para desarrollo y pruebas. El proveedor se elige por entorno (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, más `APP_URL` para armar el enlace), como `ImageStorage` en ADR-022. `EMAIL_PROVIDER` es `console` por defecto y `ConsoleEmailSender` solo escribe el enlace y el destinatario si `NODE_ENV` es `development` o `test`. `REQUIRE_VERIFIED_EMAIL` (por defecto `true`) permite apagar solo la exigencia de verificar para registrar precios mientras no haya proveedor de correo; la configuración falla al arrancar en producción con `REQUIRE_VERIFIED_EMAIL=true` y `EMAIL_PROVIDER=console`, porque nadie recibiría el enlace. El token se consume con un solo `UPDATE` atómico (un solo uso real: de dos verificaciones simultáneas gana una y la otra recibe el 422 genérico) y guardar el token nuevo e invalidar los anteriores es una transacción con un índice único parcial (un solo enlace vigente por cuenta). El registro envía el correo en segundo plano: si el proveedor falla, el registro no falla, y así tarda lo mismo con un correo nuevo que con uno ya registrado (EC-08).
3. **Flujo.** El registro crea la cuenta y envía un enlace a la PWA (`/verificar-correo?token=…`). La PWA hace `POST /v1/auth/verify-email` con el token (un `GET` con efectos lo consumirían los antivirus y las vistas previas). `POST /v1/auth/resend-verification` reenvía el enlace a **la cuenta de la sesión** (no recibe un correo), con límite de 3 por hora por cuenta, y responde igual si la cuenta ya estaba verificada. El reenvío es por sesión y no por correo porque la persona acaba de registrarse y puede iniciar sesión sin verificar (punto 4): una ruta pública que recibiera un correo revelaría qué correos existen y serviría para enviar correo a terceros (EC-08, como el registro); por sesión no hay nada que enumerar y el límite es por cuenta, no por IP. `POST /v1/auth/verify-email` es pública, con límite por IP, y un token desconocido, vencido o usado responde el mismo 422 `INVALID_VERIFICATION_TOKEN`.
4. **Efecto.** La cuenta puede iniciar sesión sin verificar, pero **registrar precios (RF-006) exige correo verificado**. Comparar, ver el mapa y la canasta siguen sin cuenta. Las cuentas anteriores quedan sin verificar y reciben el aviso al entrar. `DECISIÓN DEL EQUIPO:` si exigir verificación también para iniciar sesión.
5. **Privacidad.** El proveedor de correo es un encargado más (sección 5 de la política); los mensajes no llevan datos sensibles; se agrega a la política y a `docs/privacidad.md`. Cambiar la política de fondo sube su versión y vuelve a pedir la aceptación.

### Fase 2: inicio con Google

1. OpenID Connect con código de autorización y PKCE hechos en el backend: `GET /v1/auth/google/start` y `GET /v1/auth/google/callback`, con `state` y `nonce`; alcances `openid email profile`.
2. Si el correo de Google (con `email_verified = true`) coincide con una cuenta, se vincula a ella; si no, se crea una con el rol `reportante` y el correo ya verificado. `password_hash` pasa a ser nulo en esas cuentas.
3. La sesión es la misma sesión de servidor con cookie y CSRF: nada cambia después del inicio. La clave seudónima, los roles y las pruebas de privacidad siguen valiendo.
4. Google Cloud: cliente OAuth y pantalla de consentimiento; en modo de prueba solo entran los usuarios de prueba, hay que publicarla para el público.

## Consecuencias

- Positivas: correos comprobados, menos cuentas falsas (EC-03), sin cambiar dónde viven los datos ni el modelo de sesión; ADR-014 y EC-08 siguen intactos; cada fase se puede probar con TDD.
- Negativas / riesgos: más superficie que mantener (tokens, límites, plantillas); **entregar correo exige un remitente verificable**: con un dominio propio (SPF, DKIM) la entrega es fiable; sin dominio, los proveedores gratuitos limitan a quién se puede escribir (el equipo consiguió el dominio `valoora.app` el 20-nov-2026, ver `docs/despliegue.md` paso 5 bis; confirmar los límites vigentes del proveedor). Los límites de envío gratuitos (cientos por día) pueden frenar un registro masivo.
- Trade-offs aceptados: construir en lugar de comprar, a cambio de no ceder la identidad a un tercero y no rehacer el módulo.

## Verificación

- Pruebas de `register-account`, `verify-email` y `resend-verification` (token expirado, usado, ajeno, repetido, sin enumeración de correos), en `identity/application` y en `test/integration/email-verification-http.spec.ts`.
- La prueba guardiana de esquema falla si `email_verifications` guarda un token en claro; la de respuestas públicas, si alguna ruta devuelve el correo.
- Prueba de integración: sin correo verificado, `POST /v1/reports` responde 403 con un código estable.
- Fase 2: pruebas con un proveedor OIDC simulado (`state` inválido, `nonce` repetido, correo sin verificar).

## Plan de trabajo

1. Migración y tabla; puerto `EmailSender` y adaptadores; casos de uso y rutas (backend). **Hecho** (migración 0027).
2. Contrato OpenAPI y pruebas de contrato; exigir verificación en el registro de reportes. **Hecho**: `POST /v1/reports` responde 403 `EMAIL_NOT_VERIFIED` y `GET /v1/auth/session` trae `emailVerified`.
3. PWA: aviso «Verifica tu correo», página `/verificar-correo`, reenvío.
4. Política de datos y `docs/privacidad.md` con el proveedor de correo.
5. Fase 2 (Google), cuando la fase 1 esté en producción.

## Pendientes del equipo

- Dominio conseguido (`valoora.app`, 20-nov-2026) y verificado en Google Search Console; cliente OAuth y pantalla de consentimiento publicados. Falta verificar el dominio en el proveedor de correo (`PENDIENTE`).
- Decidir si se exige verificación para iniciar sesión o solo para reportar.
- Confirmar con el docente que un módulo de identidad propio cumple lo que se espera (alternativa C de ADR-014 sigue descartada).

## Referencias

- ADR-013, ADR-014, ADR-022; `docs/calidad/privacidad-ec08.md`; `docs/privacidad.md`.
- Ley 1581 de 2012 y Decreto 1074 de 2015 (encargados del tratamiento y transferencias).
