# Grill — issue #73: cambio de rol auditado y creación de moderadores

- **Fuentes:**
  - Issue #73 (sale del grill de la #33, pregunta 8): RF-002 RN1 (los moderadores los crea otro moderador o el administrador del sistema) y RN4 (el cambio de rol queda auditado: quién, qué, cuándo). Escenario «Cambio de rol auditado».
  - Código existente: un rol por cuenta (`reportante`, `moderador`, `comercio`); `SessionGuard` lee el rol de la cuenta en cada petición; `AttemptLimiter`; bitácora inmutable de moderación (#32); clave seudónima del moderador (#32, #33); el registro y el login no revelan si un correo existe (grill de la #16, pregunta 6).
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué cambios de rol se permiten?

- **Decisión:** un moderador puede volver `moderador` a una cuenta `reportante` y devolver a `reportante` a otro moderador. No puede cambiar su propio rol (409 `OWN_ROLE`): así la aplicación no se queda sin moderadores por error. Pedir el rol que la cuenta ya tiene responde 409 `ROLE_UNCHANGED` y no se anota. `comercio` no se asigna hasta el Corte 3 (400).
- **Razón:** un moderador que abusa debe poder perder el rol desde la aplicación.

### 2. ¿Cómo encuentra el moderador la cuenta?

- **Decisión:** `POST /v1/moderation/roles` con el correo, el rol nuevo y un motivo. Si el correo no existe responde 404: solo un moderador puede saberlo. Límite provisional de 20 cambios por moderador en 15 minutos (429), para que la ruta no sirva para averiguar correos.
- **Razón:** el moderador necesita saber si se equivocó al escribir el correo; la ruta solo la usa un rol de confianza y con límite.

### 3. ¿Qué guarda la bitácora?

- **Decisión:** tabla `identity.role_changes`, inmutable con un trigger (como `moderation_log`): cuenta afectada, rol anterior y nuevo, quién lo cambió (id de su cuenta, o vacío si fue el sistema), motivo obligatorio de 10 a 500 caracteres y fecha. Guarda ids, no correos. Ninguna ruta la muestra por ahora.
- **Razón:** cumple RN4 con lo mínimo; una pantalla de historial llega cuando haga falta.

### 4. ¿Cómo nace el primer moderador?

- **Decisión:** el comando `pnpm identity:set-role <correo> <rol> "<motivo>"`, que corre quien administra el servidor. Usa el mismo caso de uso y queda en la bitácora como «sistema». El README cambia el `UPDATE` por este comando.
- **Razón:** el «administrador del sistema» de RN1 también deja rastro.

### 5. ¿Puede un moderador decidir sobre sus propios reportes?

- **Decisión:** no. Si la clave seudónima del moderador es la del autor del reporte, la decisión responde 409 `OWN_REPORT` y no se registra; la decide otro moderador.
- **Razón:** al subir a moderadora una cuenta que era reportante, sus reportes viejos pueden seguir en la cola. Es el mismo espíritu de RN5 (conflicto de interés) y se detecta sin revelar a nadie quién es el autor.

## Decisiones menores (sin pregunta)

- El cambio de rol se nota de inmediato: el guard lee el rol de la cuenta en cada petición. No hace falta cerrar sesiones.
- Una cuenta suspendida puede cambiar de rol; la suspensión sigue igual.
