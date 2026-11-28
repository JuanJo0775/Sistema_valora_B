# ADR-040: El comercio puede dejar su tienda y eliminar la que creó

- **Estado:** Aceptado (cierre final del proyecto, 2026-11-27)
- **Fecha:** 2026-11-24
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-08 (privacidad), EC-05 (el núcleo no depende de commerce)
- **Requisitos relacionados:** RF-015 (registro del comercio), RF-016 (precios oficiales), RF-005 RN7 (tiendas propuestas), D3 del grill del módulo comercial (`docs/decisiones/epic-8-modulo-comercial/`), ADR-015 (outbox), ADR-021 (esquema por módulo), ADR-032 (eliminación de la cuenta), ADR-038 (tiendas de cadena)

## Contexto

La prueba de usuario del módulo de comerciante (hallazgo **H36**) mostró que un comerciante no puede dejar su tienda: las únicas salidas son que moderación lo revoque (D3, que además le impide volver a reclamarla) o eliminar toda su cuenta (ADR-032). Quien vendió el negocio, lo cerró o registró la tienda equivocada queda atado a ella, y la tienda sigue mostrando precios «oficiales».

El equipo decidió ofrecer dos acciones a la propia cuenta, con confirmación explícita en el cliente: **dejar de administrar la tienda** y **eliminar la tienda**, esta última solo para una tienda que creó esa misma cuenta.

Hasta ahora el modelo no guardaba quién creó una tienda de forma utilizable: la propuesta de tienda lleva solo la clave seudónima de quien propone (`establishments.store_proposals.proposer_key`) y no distingue una propuesta de un reportante de la tienda nueva de un reclamo.

## Decisión

1. **`POST /v1/commerce/me/leave`** (sesión, CSRF, rol `reportante` o `comercio`; sin cuerpo). Responde **200** `{ status: "dejada", establishmentId }` o `{ status: "sin_tienda" }` si la cuenta no tiene tienda (idempotente). En una sola transacción de `commerce`: borra la solicitud **sin** escribir en `merchant_claim_rejections` (por eso no impide volver a reclamar), borra los precios oficiales, los precios en revisión y las promociones de la tienda, borra los avisos enviados a la cuenta, cierra como `descartado` los casos abiertos de la tienda (borrando los datos de quien la disputaba) y publica `OfficialPriceWithdrawn`, `PromotionWithdrawn` y `OfficialPriceReviewClosed` (los mismos de la revocación) y `MerchantLeft`. La tienda sigue en el mapa como tienda de la comunidad.
2. **`DELETE /v1/commerce/establishment`** (mismos controles). Responde **204**. Exige un comercio verificado (403 `MERCHANT_NOT_VERIFIED`) cuya solicitud diga que **creó** la tienda (403 `ESTABLISHMENT_NOT_CREATED_BY_ACCOUNT` en otro caso); sin tienda, 404 `NOT_FOUND`, también al repetirlo. Hace todo lo de dejar la tienda y además publica `MerchantEstablishmentDeleted { establishmentId }`.
3. **Cambio de rol.** `identity` recibe `MerchantLeft` y devuelve la cuenta a `reportante` (queda en `role_changes`), igual que con `MerchantRevoked`: el cambio se nota desde la siguiente acción y la sesión sigue abierta. Una solicitud pre-aprobada no publica `MerchantLeft`: la cuenta ya es reportante.
4. **Retiro de la tienda (borrado lógico).** `establishments` recibe `MerchantEstablishmentDeleted` y marca la tienda `status = 'retirada'` con `retired_at`. Una tienda retirada no sale en las tiendas cercanas, la búsqueda, el detalle, la comparación, los destacados, el historial público de precios ni las sugerencias de duplicados; no admite reportes (422 `UNKNOWN_ESTABLISHMENT`) ni reclamos (404). No se borra ninguna fila: los reportes, el historial, la reputación y las bitácoras se conservan. Su **nombre** se sigue resolviendo para «Mis aportes» y las colas de moderación.
5. **Quién creó la tienda.** `commerce.merchant_claims.created_establishment` es `true` solo cuando la solicitud nace de `newEstablishment`. Si moderación **fusiona** esa propuesta con una tienda existente, pasa a `false`. Las solicitudes anteriores a la migración 0050 quedan en `false` («no creada por la cuenta»). La marca vive en la solicitud: al dejar la tienda se pierde, así que quien la deja y la vuelve a reclamar ya no puede eliminarla, y quien la reclama después tampoco.
6. **Para el portal**, `GET /v1/commerce/me` suma `canDeleteEstablishment` (comercio verificado que creó la tienda). Cambio aditivo.
7. **Migración 0050:** `created_establishment` en `commerce.merchant_claims`; `status` (`activa` o `retirada`) y `retired_at` en `establishments.establishments`.
8. **No cambia:** la revocación por moderación (sigue bloqueando volver a reclamar), la regla de cadenas (ADR-038: aplica al volver a reclamar) ni la eliminación de la cuenta (ADR-032): la purga de una cuenta que dejó o eliminó su tienda ya no encuentra solicitud y borra lo que quede.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Borrar la fila de la tienda | Destruye el historial de precios y deja reportes, observaciones y bitácoras apuntando a nada. |
| Dejar la tienda como una revocación hecha por la propia cuenta | La revocación impide volver a reclamar y escribe en el historial un hecho que no ocurrió. |
| Guardar quién creó la tienda en `establishments` | Repartiría la relación cuenta-tienda en dos módulos y metería un dato de cuenta en un esquema que solo guarda claves seudónimas (EC-08). |
| Deducirlo de `store_proposals.proposer_key` | Incluiría las tiendas propuestas como reportante y las de antes de esta decisión; el equipo pidió tratar las anteriores como no creadas por la cuenta. |
| Retirar la tienda llamando a `establishments` dentro de la petición | Dos escrituras sin transacción común; el outbox (ADR-015) ya resuelve la entrega y el reintento. |
| Transferir la tienda a otra cuenta | No se pidió. La tienda queda libre y la otra persona la reclama con las reglas de siempre. |

## Consecuencias y riesgos

- **Consistencia eventual.** Entre la respuesta y la entrega del outbox pasan unos instantes en los que el rol, la copia del precio oficial o la tienda eliminada todavía se ven. Es el mismo comportamiento de la revocación.
- **Eliminar no pide permiso a moderación.** Quien creó la tienda puede ocultar con ella los reportes de la comunidad. Se acota a tiendas creadas por la propia cuenta; los datos se conservan y se pueden recuperar en la base. No hay ruta para restaurar una tienda retirada.
- **Tiendas anteriores** a la migración, aunque las haya creado la cuenta, no se pueden eliminar por esta vía: solo dejar.
- **Propuesta aún pendiente.** Dejar una solicitud pre-aprobada de una tienda nueva no retira su propuesta: si moderación la aprueba, la tienda aparece en el mapa sin dueño.
- **Pendientes de moderación sobre una tienda retirada** (reportes en revisión, correcciones de nombre o ubicación) siguen en sus colas; decidirlos no vuelve visible la tienda.
- **Lectores que filtran por tienda.** Toda lectura pública nueva de tiendas debe pasar por la interfaz de `establishments`, que excluye las retiradas.
- **Eliminar la cuenta (H35).** Sigue igual: no retira la tienda del mapa. El aviso en la pantalla es trabajo del frontend, que puede sugerir antes dejar o eliminar la tienda.
