# Grill — issue #32: reporte de información dudosa, cola y bitácora

- **Fuentes:**
  - Issue #32 (Corte 2, épica #5): un usuario marca un precio como dudoso y un moderador lo revisa. Criterios: cola visible solo para el rol moderador; cada decisión registra quién, cuándo y por qué (bitácora inmutable); la identidad del reportante no se expone al público.
  - RF-013 (Notion): RN1 marcar requiere cuenta, un reporte por usuario y dato; RN2 la cola se prioriza por gravedad (anómalos detectados y datos con varios reportes primero); RN3 toda decisión exige motivo y queda auditada; RN4 el autor de un reporte rechazado puede apelar una vez (otro moderador revisa); RN5 un moderador no modera un comercio con el que tiene relación; RN6 N rechazos seguidos suspenden la cuenta (N parametrizable). Escenarios: marcar con motivo y no repetir; sin cuenta pide iniciar sesión; rechazar sin motivo no se guarda; suspensión; apelación.
  - `docs/openapi.yaml`: `POST /reports/{reportId}/flag` (motivos `precio_falso`, `producto_equivocado`, `establecimiento_equivocado`, `otro`), `GET /moderation/queue` (filtro `reason`: `desviacion`, `marcado`, `discrepancia_oficial`, `verificacion_comercio`), `POST /moderation/{itemId}/decision` (`aprobar`, `descartar`, `observar_cuentas`) y `ModerationItem`.
  - Código existente: `reliability` guarda cada reporte con su veredicto (`observations`) y la reputación; `updateReputation(…, 'rejected')` resta 0,20 (#19); `price_current.status` puede ser `en_revision` (#31); el guard `@Roles` de la #16.
  - Issues relacionadas: #33 (rol moderador, bloqueo de cuentas, matriz de autorización).
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Alcance:** apelación, suspensión y conflicto de interés dependen de la #33 y del Corte 3.
2. **Dónde vive:** la regla de arquitectura pone la cola en `reliability`; `docs/ARCHITECTURE.md` muestra un módulo `moderation` aparte.
3. **Qué es un elemento de la cola:** los sospechosos automáticos, los marcados por usuarios o los dos.
4. **Efecto de cada decisión** en el precio vigente y en la reputación.
5. **Bitácora:** cómo se guarda quién decidió sin exponerlo.
6. **Qué muestra la cola y en qué orden.**
7. **Cómo existen los moderadores** hoy.

## Preguntas

### 1. ¿Qué cubre la #32?

- **Decisión:** el ciclo básico: marcar un precio como dudoso (una vez por cuenta, con motivo), la cola solo para moderadores con los sospechosos automáticos y los marcados, decidir `aprobar`, `descartar` u `observar_cuentas` siempre con motivo, la bitácora inmutable y el efecto de cada decisión en el precio y en la reputación (`rejected`, −0,20). La suspensión por rechazos seguidos (RN6) y el efecto real de `observar_cuentas` van a la #33; en la #32, `observar_cuentas` solo queda en la bitácora. La apelación (RN4) va a una issue nueva. El conflicto de interés con comercios (RN5), al Corte 3.
- **Razón:** la #32 queda de un tamaño manejable y cada regla va a la issue que tiene lo que necesita (bloqueo de cuentas y otro moderador en la #33; comercios en el Corte 3), sin dejar nada a medias.

### 2. ¿Dónde vive la moderación?

- **Decisión:** dentro de `reliability`, con sus propios casos de uso (`FlagReport`, `ModerationQueue`, `DecideModeration`), tablas (`flags`, `moderation_log`) y controlador. `docs/ARCHITECTURE.md`, que mostraba un módulo `moderation` aparte, se corrige en el mismo pull request para coincidir con la regla de arquitectura.
- **Razón:** la moderación trabaja sobre las observaciones y la reputación que ya guarda `reliability`; separarla obligaría a copiar datos o a llamarse entre dos módulos del núcleo en cada decisión. La lista de módulos aprobados es la de la regla, y un módulo nuevo exigiría un ADR sin ganar nada.

### 3. ¿Qué entra a la cola?

- **Decisión:** cada elemento es un reporte (una observación de `reliability`); el `itemId` es el id del reporte. Entra por `desviacion` (la detección lo marcó `sospechoso`) o por `marcado` (al menos una cuenta lo marcó como dudoso); si son las dos, el motivo es `desviacion` y el elemento dice cuántas cuentas lo marcaron. Al decidirlo sale de la cola. `discrepancia_oficial` y `verificacion_comercio` quedan para el Corte 3. La comparación agrega `reportId` a cada resultado para que el frontend sepa qué reporte marcar.
- **Razón:** el precio vigente cambia cuando llega un reporte nuevo: marcar «el precio de la tienda» apuntaría a otro precio del que la persona vio. El id del reporte no identifica a nadie.

### 4. ¿Qué hace cada decisión?

- **Decisión:**
  - **`aprobar`:** el reporte queda `aprobado` y cuenta como precio normal (también como referencia); `reliability` vuelve a publicar `PriceAssessed` con veredicto `normal`, y `comparison` aplica su regla de siempre (si estaba `en_revision` pasa a competir; si es más reciente que el vigente, lo reemplaza). La reputación no cambia.
  - **`descartar`:** el reporte queda `descartado` y deja de contar para mediana, score y confirmaciones, sin borrarse. Si era el precio que se mostraba, `reliability` publica `PriceWithdrawn` con el reemplazo (el reporte más reciente de esa tienda que no esté sospechoso ni descartado) y `comparison` lo pone en su lugar o borra la fila si no hay ninguno. La reputación del autor baja 0,20 (`rejected`).
  - **`observar_cuentas`:** solo queda en la bitácora; el efecto llega con la #33.
- **Razón:** aprobar reutiliza lo que `comparison` ya sabe hacer; descartar nunca deja un precio falso en pantalla ni vacía la tienda si había otro precio confiable; nada se borra (arquitectura y RF-012 RN4).

### 5. ¿Cómo son la bitácora y las marcas?

- **Decisión:**
  - **`reliability.moderation_log`:** `id`, `report_id`, `decision`, `note` (motivo obligatorio, 10 a 500 caracteres; el contrato se corrige de opcional a obligatorio, RN3), `moderator_key` (clave seudónima del moderador, la HMAC de la #31) y `decided_at`. Un trigger de PostgreSQL rechaza todo `UPDATE` o `DELETE`, y una prueba lo verifica.
  - **`reliability.flags`:** `report_id`, `flagger_key`, `reason` (motivos del contrato), `comment` (opcional, hasta 280) y `created_at`, con llave (`report_id`, `flagger_key`): la base impide que una cuenta marque dos veces el mismo reporte; el segundo intento responde 409 `ALREADY_FLAGGED`.
  - Sin ruta para consultar la bitácora por ahora (YAGNI).
- **Razón:** la inmutabilidad la garantiza la base, no la disciplina del código. La clave seudónima permite auditar a través de `identity` sin guardar ids de cuenta en `reliability`. RN1 y RN3 de RF-013 quedan cubiertas por la base y el contrato.

### 6. ¿Qué muestra la cola y en qué orden?

- **Decisión:** `ModerationItem` con `id` (el reporte), `reason`, `productName` y `establishmentName` (dos consultas públicas nuevas de `catalog` y `establishments`), `reportedPriceCop`, `medianPriceCop` y `deviationPercent` del veredicto guardado (`medianPriceCop` pasa a opcional: un marcado `sin_datos` no tiene mediana), `reportersCount` (cuentas que lo marcaron) y `createdAt`. Nunca muestra quién reportó ni quién marcó, ni sus claves. Orden: primero `desviacion` (mayor desviación primero), luego `marcado` (más marcas primero); en empate, el más antiguo. Filtro `reason` y `limit` (20 por defecto, 50 máximo).
- **Razón:** RN2 de RF-013 pide priorizar por gravedad; el desempate por antigüedad evita que algo espere para siempre. El moderador decide por el dato, no por la persona (criterio 3 de la #32).

### 7. ¿Quién puede marcar y cómo existen los moderadores?

- **Decisión:** solo el `reportante` marca (sesión y CSRF; sin sesión, 401). Ni `comercio` (podría marcar en masa a la competencia) ni `moderador` (decide, no denuncia). La #32 no crea mecanismo para crear moderadores: hoy existen con `role = 'moderador'` en la base (las pruebas usan `signIn`); el README explica cómo hacerlo en desarrollo. La forma correcta la construye la #33.
- **Razón:** RF-013 RN1 dice «un Reportante (usuario con cuenta)». Un comando para crear moderadores sería trabajo de la #33 (pregunta 1).

## Resultado

Siete decisiones. El contrato está en `contrato-api.md` y el plan en `plan.md`.
