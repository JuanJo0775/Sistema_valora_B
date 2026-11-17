# Grill — issue #33: roles, suspensión de cuentas y matriz de autorización

- **Fuentes:**
  - Issue #33 (Corte 2, épica #1): roles consumidor, reportante y moderador (comercio en el Corte 3); bloquear una cuenta revoca sus sesiones; 20 casos de autorización por rol (PR-14); 100 % de rutas sensibles con control de rol (RNF-010). Comentario: también cubre RN6 de RF-013 y el efecto de `observar_cuentas` (grill de la #32, pregunta 1).
  - RF-002 (Notion): cuatro roles; RN1 los moderadores los crea otro moderador o el administrador; RN2 un comercio solo gestiona su tienda; RN3 un reportante no modera; RN4 la moderación y los cambios de rol quedan auditados.
  - RF-013 (Notion): el moderador puede «suspender cuentas»; RN6 N rechazos seguidos suspenden la cuenta (N parametrizable).
  - Código existente: un rol por cuenta (`reportante`, `comercio`, `moderador`; grill de la #16, pregunta 5); `SessionGuard` con `@Roles`; sesiones revocables; `ReporterIdentity` (clave seudónima HMAC); bitácora de moderación de la #32.
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué es «consumidor»?

- **Decisión:** quien consulta sin sesión. No es un valor nuevo de `role`: la consulta sigue siendo pública (RF-001) y, al registrarse e iniciar sesión, la persona es `reportante`. La matriz lo trata como «sin sesión».
- **Razón:** un rol que no puede hacer nada distinto a no tener cuenta no aporta (YAGNI) y obligaría a cambiar el registro.

### 2. ¿Cómo se bloquea una cuenta?

- **Decisión:** por dos caminos, sin rutas nuevas: la decisión `observar_cuentas` sobre un reporte suspende a su autor, y RN6 suspende sola una cuenta con N descartes seguidos. El moderador nunca ve quién es el autor.
- **Razón:** el moderador trabaja sobre reportes, no sobre cuentas (EC-08). Una ruta por id de cuenta obligaría a mostrarlas.

### 3. ¿Cómo encuentra `identity` la cuenta?

- **Decisión:** `identity.accounts` gana la columna `reporter_key` (única). `ReporterIdentity` la guarda cada vez que la calcula (al reportar o marcar), así que todo autor de un reporte la tiene.
- **Razón:** el HMAC no se invierte; recorrer todas las cuentas en cada suspensión no escala. La clave no sale de `identity` más de lo que ya sale hoy.

### 4. ¿Cuánto dura una suspensión?

- **Decisión:** 7 días (provisional, ADR-005), en la columna `suspended_until`. Al suspender se revocan todas las sesiones de la cuenta. Un inicio de sesión antes de la fecha, con la contraseña correcta, responde 403 `ACCOUNT_SUSPENDED` con la fecha de fin. Una suspensión nueva la extiende; nunca la acorta. La consulta sin sesión sigue abierta.
- **Razón:** es preventiva: una cuenta honesta mal juzgada recupera el acceso sola, sin una pantalla de administración que hoy no existe.

### 5. RN6: ¿qué son «N rechazos seguidos»?

- **Decisión:** se miran, en orden, las decisiones `aprobar` y `descartar` sobre los reportes de la cuenta. La racha es la cantidad de `descartar` al final de la lista; un `aprobar` la corta. Los reportes sin moderar y `observar_cuentas` no cuentan. Con N = 3 (provisional), cada vez que la racha llega a un múltiplo de 3 (3, 6…) la cuenta se suspende; así el contador «vuelve a 0» sin guardar estado. Es una regla del dominio (`src/domain/suspension.ts`).
- **Razón:** usa la bitácora que ya existe y separa la moderación humana de la detección automática.

### 6. ¿Cómo le pide `reliability` a `identity` que suspenda?

- **Decisión:** con el evento `ReporterSuspensionRequested` v1 por el outbox (ADR-015), publicado en la misma transacción de la decisión: clave seudónima, motivo (`observar_cuentas` o `rechazos_seguidos`) y fecha de fin. `identity` lo escucha, guarda la suspensión y revoca las sesiones.
- **Razón:** es atómico con la decisión y no agrega imports entre módulos. La suspensión tarda lo que tarda el outbox (segundos).

### 7. ¿Cómo se demuestra la matriz de autorización?

- **Decisión:** (1) `docs/calidad/matriz-autorizacion.md` con cada ruta frente a sin sesión, reportante, moderador, comercio y cuenta suspendida; (2) una prueba HTTP que recorre la tabla (más de 20 casos, PR-14); (3) una prueba que revisa todas las rutas de la aplicación y falla si una fuera de la lista pública no tiene `SessionGuard` y `@Roles` (RNF-010).
- **Razón:** la tabla es la evidencia para Modelos de Calidad y la prueba guardiana impide que una ruta nueva quede abierta sin que nadie lo note.

### 8. ¿Qué queda fuera?

- **Decisión:** el cambio de rol auditado y la creación de moderadores desde la app (RF-002 RN1 y RN4) van a una issue nueva; mientras, se crean por SQL (README). RN2 (comercio solo su tienda) va al Corte 3 con `commerce`.
- **Razón:** no están en los criterios de la #33 y necesitan buscar cuentas por correo, una superficie nueva.
