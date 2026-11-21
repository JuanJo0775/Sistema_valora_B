# Grill: inicio de sesión con Google (épica #178)

Preguntas que ADR-029 no respondía. Decididas por el equipo el 20-nov-2026 con la recomendación.

## 1. ¿Con qué se implementa OpenID Connect?

| Opción | A favor | En contra |
|---|---|---|
| A. A mano con `fetch` y `node:crypto` | Sin dependencias nuevas | Validar el `id_token` (firma con las claves de Google, `aud`, `iss`, `exp`, `nonce`) es fácil de hacer mal y difícil de probar |
| B. `openid-client` | Implementación certificada por la OpenID Foundation; resuelve PKCE, `state`, `nonce` y la validación | Una dependencia más |
| C. Passport (`passport-google-oauth20`) | Muy usado con NestJS | Arrastra sesiones de Passport que no encajan con la sesión propia (ADR-014) |

**Decisión: B.** Queda detrás de un puerto (`GoogleIdentityProvider`), así que los casos de uso no la conocen y las pruebas usan un doble. Se anota en ADR-029.

## 2. ¿Cómo acepta la política una cuenta nueva que entra con Google?

RF-001 y la Ley 1581 exigen un consentimiento expreso. **Decisión:** la cuenta no se crea en el callback. La PWA muestra `/bienvenida` (política y nombre visible) y la cuenta se crea con `POST /v1/auth/google/complete`. Pulsar el botón de Google no cuenta como aceptar.

## 3. ¿Cómo confirma la eliminación (ADR-032) una cuenta sin contraseña?

| Opción | A favor | En contra |
|---|---|---|
| A. Escribir el correo de la cuenta | Simple; misma pantalla; evita la eliminación por un clic accidental | Más débil que una contraseña si alguien tiene la sesión abierta, igual que hoy con la sesión robada |
| B. Volver a entrar con Google justo antes | Más fuerte | Otro ida y vuelta con Google y más código |

**Decisión: A.** La sesión, el CSRF y los límites de intentos siguen exigiéndose; la eliminación tarda 10 días y se puede restaurar.

## 4. ¿Qué pasa si el correo de Google ya tiene una cuenta con contraseña?

**Decisión:** se vincula (ADR-029, punto 2). Si esa cuenta **no** tenía el correo verificado, se borra su contraseña y se cierran sus sesiones: así nadie que haya registrado antes el correo ajeno conserva el acceso. Si estaba verificada, conserva su contraseña y puede entrar de las dos formas.

## 5. ¿Dónde se guarda el vínculo con Google?

**Decisión:** una columna `google_subject` (el `sub` de Google, fijo aunque la persona cambie de correo), única y nula, en `identity.accounts`. Una tabla de identidades externas solo haría falta con un segundo proveedor (YAGNI). Entra en el paso 2, que es el primero que la usa.
