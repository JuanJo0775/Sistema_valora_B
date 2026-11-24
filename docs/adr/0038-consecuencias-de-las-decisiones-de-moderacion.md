# ADR-038: Estado final de cada decisión de moderación y causa visible de la suspensión

- **Estado:** Propuesto (decisión del equipo registrada el 24-nov-2026; pendiente de aceptación formal)
- **Fecha:** 2026-11-24
- **Responsables:** integrante que dirige el backend; revisado por el equipo.
- **Escenarios relacionados:** EC-03 (reportes maliciosos), EC-08 (privacidad)
- **Requisitos relacionados:** RF-013; ADR-006, ADR-013, ADR-030
- **Origen:** hallazgos H34, H33, H31 y H15 del informe de la prueba de usuario del módulo de comerciante (24-nov-2026).

## Contexto

Un moderador eligió «Observar cuentas» sobre un reporte de $150 por 1 kg de arroz. La cola quedó vacía, pero `GET /v1/me/reports` seguía diciendo `en_revision` y la ficha pública de la tienda mostraba el precio «En revisión» (H34). La cuenta quedó suspendida 7 días sin que la sesión dijera por qué (H33).

La causa estaba en el código y en un vacío de los documentos: el grill de la #32 (pregunta 4) dijo que `observar_cuentas` «solo queda en la bitácora» y el de la #33 le añadió el efecto sobre la **cuenta** (suspender 7 días), pero ninguno dijo qué pasa con el **reporte**. `DrizzleModerationStore.decide` no le ponía estado (`observations.moderation` seguía nulo), así que `reportStateOf` lo calculaba «en revisión» y `comparison` conservaba su fila `en_revision`, porque nadie publicaba `PriceAssessed` ni `PriceWithdrawn`.

Los documentos sí dicen qué hacen las otras dos decisiones: `aprobar` deja el reporte `aprobado`, `reliability` publica `PriceAssessed` normal y `comparison` lo vuelve a mostrar; `descartar` lo deja `descartado`, publica `PriceWithdrawn` con el reemplazo y baja la reputación del autor (grill de la #32, pregunta 4). Ahí no hubo nada que corregir: esos caminos ya publican los eventos y las proyecciones de `comparison` (precio vigente e historial) los aplican.

## Alternativas consideradas para `observar_cuentas`

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Dejarlo `aprobado` (el precio queda vigente y la cuenta se observa) | Coherente con «observar» como vigilancia | Un precio que un moderador miró y cuya cuenta le dio dudas quedaría publicado; incoherente con suspender a quien lo reportó |
| B. Dejarlo en la cola hasta una segunda decisión | No decide nada solo | Es el hallazgo: el reporte queda abierto y la persona ve un asunto que moderación ya cerró |
| C. Retirarlo (`descartado`) y además suspender la cuenta, sin bajar la reputación | El reporte tiene un estado final; no se muestra un precio dudoso; la sanción es una sola | Reutiliza `descartado` para algo que no es un descarte «puro» |
| D. Estado nuevo (`observado`) | Fiel al nombre | Cambia el contrato de estados en todas las lecturas, la base y el frontend para distinguir algo que el autor no necesita distinguir |

## Decisión

Se adopta **C**. Cada decisión deja el reporte en un estado final, igual en todos los lugares donde se lee:

| Decisión | Estado del reporte | `GET /me/reports` | Tienda, comparación e historial | Cuenta del autor |
|---|---|---|---|---|
| `aprobar` | `aprobado` | `normal` | Vigente (`PriceAssessed` normal); en el historial cuenta | Sin cambio; la reputación no cambia |
| `descartar` | `descartado` | `descartado`, con plazo para apelar | Retirado (`PriceWithdrawn`, con reemplazo si lo hay); en el historial, `retirado` | Reputación −0,20; el tercer descarte seguido suspende 7 días (RN6) |
| `observar_cuentas` | `descartado` | `descartado`, **sin** plazo para apelar | Retirado (`PriceWithdrawn`); en el historial, `retirado` | Suspendida 7 días (#33); la reputación **no** baja |

- **Sin reputación en `observar_cuentas`.** La suspensión ya es la sanción de esa decisión; descontar además reputación sería castigar dos veces. Tampoco cuenta en la racha de RN6: el grill de la #33 ya decía que «observar no cuenta», y se conserva porque la bitácora guarda `observar_cuentas`, no `descartar`.
- **Sin apelación del reporte.** Apelar exige un descarte (`descartar`); aceptar la apelación levanta la suspensión que ese descarte causó. `observar_cuentas` no es apelable. Si el equipo quiere que la cuenta pueda apelar esta suspensión, es una decisión aparte: hoy la regla de negocio no cambia.
- **La regla de la suspensión no cambia** (7 días, inmediata, por un reporte). Solo se hace visible.
- **Causa visible (H33).** `identity.accounts.suspension_reason` guarda una causa de un conjunto estable: `observada_por_moderacion` (`observar_cuentas`), `descartes_seguidos` (RN6) y `no_registrada` (suspensiones anteriores a la migración 0047; nunca se inventa una causa). `GET /v1/auth/session` suma `suspension: { until, reason }` y conserva `suspendedUntil`. `ReporterSuspensionRequested` no cambia: `identity` traduce su `reason` interno (`observar_cuentas`, `rechazos_seguidos`) al conjunto público, así los nombres internos pueden evolucionar sin romper el frontend. No hay causa `rafaga`: ninguna ráfaga suspende hoy una cuenta (solo manda el reporte a la cola). Si dos suspensiones se acumulan, vale la causa de la que fija la fecha de fin vigente; al levantarla por apelación la causa se borra.
- **Privacidad (EC-08).** La causa no incluye la nota del moderador ni quién denunció.
- **H31.** `GET /v1/establishments/{id}/merchant-reports` devuelve `canReport: false` y `alreadyReported: true` si la cuenta ya tiene una denuncia abierta (la misma regla con la que el POST responde 409). El campo solo aparece cuando es cierto, para no cambiar el cuerpo de los demás casos.
- **H15.** `GET /v1/commerce/me` de una cuenta con `status: revocado` devuelve siempre «Moderación revocó el registro de esta cuenta para esa tienda.» en `reason`. La nota del moderador sigue en la bitácora (`commerce.merchant_cases.note` y el historial de la solicitud), que solo lee `MerchantProfile`; se revisaron los demás lectores y ninguna otra ruta de comercio la expone. `rechazado` (tienda propuesta o reclamo rechazado) conserva el motivo del moderador.

## Consecuencias

(+) Ningún aporte queda «en revisión» tras una decisión; la cola, «Mis aportes», la tienda, la comparación y el historial coinciden.

(+) El frontend puede explicarle a la persona por qué está suspendida, sin datos internos.

(+) Cambios aditivos: `suspension` y `alreadyReported` son campos nuevos; `suspendedUntil` y `canReport` siguen igual. El único valor que cambia es el texto de `reason` en una revocación.

(−) Los reportes observados antes de este cambio quedaron sin estado final y siguen en la cola; un moderador puede decidirlos de nuevo para cerrarlos (con `observar_cuentas` se volvería a pedir la suspensión, que nunca se acorta). No se hizo una migración de datos.

(−) `descartado` en «Mis aportes» no distingue un descarte de una observación; el autor tampoco debería saber cuál fue la decisión interna (grill de la #71, pregunta 1).

(−) Un solo reporte puede suspender 7 días. Es la regla vigente (decisión del equipo); este ADR no la cambia.

## Contrato para el frontend

- `GET /v1/auth/session` con la cuenta suspendida: `{ ..., suspendedUntil, suspension: { until, reason } }`, con `reason` en `observada_por_moderacion | descartes_seguidos | no_registrada`.
- `GET /v1/establishments/{id}/merchant-reports`: `{ canReport: boolean, alreadyReported?: true }`.
- `GET /v1/commerce/me` con `status: revocado`: `reason` es el mensaje estándar.
- `GET /v1/me/reports`: tras `observar_cuentas`, el aporte pasa a `descartado` sin `appealableUntil`.

## Verificación

- `decide-moderation.spec.ts` y `moderation-consequences-e2e.spec.ts` (los tres caminos, de la cola a la tienda y al historial).
- `suspend-reporter.spec.ts`, `lift-suspension.spec.ts`, `resolve-session.spec.ts` e `identity-suspension.spec.ts` (causa de la suspensión).
- `report-merchant.spec.ts`, `merchant-profile.spec.ts` y `commerce-cases-http.spec.ts` (H31 y H15).
