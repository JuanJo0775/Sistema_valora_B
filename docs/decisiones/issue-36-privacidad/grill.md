# Grill — issue #36: inspección de privacidad de la API y la base (EC-08)

- **Fuentes:**
  - Issue #36 (Corte 2, épica #1): 0 datos personales en respuestas públicas; 0 coordenadas de usuarios guardadas; datos del reportante en un esquema separado (PR-15); evidencia para el informe de seguridad. RNF-007, EC-08, Ley 1581.
  - Revisión de la base `valora_test` (15-nov-2026): correo y contraseña solo en `identity.accounts`; la única columna geográfica es `establishments.establishments.location` (la tienda); `reliability` guarda solo claves seudónimas (`reporter_key`, `flagger_key`, `moderator_key`); `pricing.reports.reporter_id` guarda el id de la cuenta; ninguna tabla guarda IP.
  - Registros: no hay registro de peticiones; solo se registran errores inesperados (con su traza) y la salida de los comandos `db:seed` e `identity:set-role`.
- **Fecha:** 2026-11-15.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### 1. ¿Qué hacemos con `pricing.reports.reporter_id`?

- **Decisión:** se deja como identificador interno y se documenta. Es una referencia seudónima (un UUID, sin correo ni nombre) que `pricing` necesita para la idempotencia, el duplicado y la ráfaga (#14, #29). Una prueba verifica que nunca sale en respuestas ni en eventos.
- **Razón:** cambiarlo por la clave seudónima pide una migración que recalcule claves con el secreto (no se puede en SQL) y tocar tres reglas, sin cambiar lo que ve el público.

### 2. ¿Cómo se demuestra?

- **Decisión:** pruebas guardianas más un informe.
  - **Esquema:** una prueba revisa la base y falla si aparece correo o contraseña fuera de `identity`, una columna de coordenadas fuera de la tienda o una columna de IP.
  - **Respuestas:** una prueba recorre todas las rutas públicas con datos sembrados y falla si alguna trae el correo, el id de la cuenta, la clave seudónima o la ubicación consultada.
  - **Informe:** `docs/calidad/privacidad-ec08.md` con la tabla de rutas, tablas y registros, y los hallazgos.
- **Razón:** una ruta o columna nueva podría romper la privacidad sin que nadie lo note; las pruebas lo impiden y el informe es la evidencia del entregable.
