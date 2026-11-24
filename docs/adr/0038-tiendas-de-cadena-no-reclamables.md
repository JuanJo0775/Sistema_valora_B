# ADR-038: Las tiendas de cadena no se reclaman y el supermercado pasa por moderación

- **Estado:** Propuesto
- **Fecha:** 2026-11-24
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-08 (privacidad), RN5 de detección de reportes anómalos
- **Requisitos relacionados:** RF-015 (registro del comercio), RF-016 (precios oficiales), D2 y D3 del grill del módulo comercial (`docs/decisiones/epic-8-modulo-comercial/`), ADR-015 (outbox), ADR-021 (esquema por módulo)

## Contexto

La prueba de usuario del módulo de comerciante (hallazgo **H11**) mostró que una cuenta reportante que esté a 50 m de una tienda existente sin dueño, por ejemplo una D1, una Ara o un Éxito, la reclama con `POST /v1/commerce/claims` y queda **verificada al instante**: rol `comercio` y capacidad de publicar «precios oficiales» de una cadena nacional, sin NIT ni revisión. Es lo que pedía la D2 del grill (cercanía de 50 m), pero abre la puerta a que cualquiera publique precios falsos con la etiqueta «oficial», que el público tiende a creer más (ver H6 y H19 del informe).

El equipo decidió que **una tienda de cadena no tiene un dueño que la reclame desde la aplicación**: los precios de D1, Ara o Éxito los define la cadena, no la persona que está cerca de una sucursal.

## Decisión

1. **Función pura de dominio** `isChainStore(name, type)` en `src/domain/chain-store.ts`. Una tienda es de cadena si su tipo es `descuento` (D1 y Ara en la semilla) o si su nombre contiene, **como palabra completa**, sin distinguir mayúsculas ni tildes, alguna de las cadenas de `CHAIN_NAMES`. Esa lista es el único lugar donde se declaran las cadenas. «Panadería D10» no es D1; «Aracely» no es Ara.
2. **Lista inicial** (`CHAIN_NAMES`): D1, Ara, Éxito, Olímpica, Carulla (las que trae la semilla: `seed/tiendas.csv` y `seed/precios-iniciales.csv`) y las evidentes: Jumbo, Metro, Alkosto, Makro, Justo & Bueno (también «Justo y Bueno»), PriceSmart (también «Price Smart»), Surtimax, Super Inter y Oxxo. Agregar una cadena es agregar un nombre a esa lista (con su prueba).
3. **Tres caminos** (`claimPathFor(name, type)`):
   - `cadena`: `POST /v1/commerce/claims` responde **422 `CHAIN_STORE_NOT_CLAIMABLE`**, con un mensaje claro en español. No se guarda nada, no se abre disputa aunque la tienda ya tenga dueño y no se pide la cercanía.
   - `revision` (tipo `supermercado` que no es de cadena): el reclamo **no verifica al instante**. Queda `pre_aprobado` (sin `MerchantVerified`, la cuenta sigue siendo reportante) y abre un caso de tipo **`reclamo`** en la cola de moderación de comercios.
   - `inmediata` (`barrio` y `minimercado`): se mantiene la verificación instantánea por cercanía de 50 m, sin cambios.
4. **Orden de comprobación:** sesión (401), correo verificado (403), NIT bien escrito (400), tienda existente (404), **cadena (422 `CHAIN_STORE_NOT_CLAIMABLE`)**, cercanía (422 `NOT_AT_ESTABLISHMENT`), cuenta revocada de esa tienda (422 `REVOKED_FROM_ESTABLISHMENT`), una tienda por cuenta (409 `ACCOUNT_HAS_ESTABLISHMENT`) y dueño existente (409 `ESTABLISHMENT_HAS_OWNER`, con disputa). La cadena va antes de la cercanía para no dar una pista falsa («acércate») sobre una tienda que nunca se podrá reclamar.
5. **Caso `reclamo`** (`merchant_cases.kind = 'reclamo'`, migración 0045). Lleva solo la clave seudónima de quien reclama (EC-08), como las denuncias y las disputas; el moderador ve el comercio que espera revisión en `owner` (`status: "pre_aprobado"`, nombre del responsable, NIT y teléfono). Se guarda en la **misma transacción** que la solicitud (ADR-015). Si quedó un reclamo pendiente de una cuenta que ya no está (por ejemplo, borrada), se cierra como `descartado` al abrir el nuevo, para que decidir el viejo no verifique a otra cuenta.
6. **Decisiones** de `POST /v1/moderation/merchant-cases/{caseId}/decision`, siempre con motivo de 10 a 500 caracteres:
   - `aprobar` (solo `reclamo`): la solicitud queda `verificado`, el caso `aprobado` y se publica `MerchantVerified`, que concede el rol `comercio` por el camino de siempre. Todo en una transacción.
   - `rechazar` (solo `reclamo`): la solicitud sale de las activas con el motivo (historial `merchant_claim_rejections`, resultado `rechazado`), el caso queda `rechazado` y la cuenta sigue siendo reportante; `GET /v1/commerce/me` muestra `rechazado` con el motivo y puede registrar otra tienda.
   - `revocar` y `descartar` siguen siendo de la denuncia y la disputa. Una decisión que no corresponde al tipo de caso responde **422 `DECISION_NOT_APPLICABLE`** y no cambia nada.
   - Si el reclamo ya no está pre-aprobado (la cuenta se borró o se revocó), `aprobar` o `rechazar` solo cierran el caso como `descartado`.
7. **No cambia:** la regla de 50 m, `NOT_AT_ESTABLISHMENT`, la tienda **nueva** propuesta por el comercio (`newEstablishment`, preaprobada hasta que se apruebe la tienda), la disputa de una tienda con dueño ni los roles de las rutas.
8. **`GET /v1/commerce/me`** ya muestra `pre_aprobado` (con `unlocks`) para una solicitud pre-aprobada; no cambia su forma.

## Alternativas descartadas

- **Pasar también las cadenas por moderación.** Es lo mínimo que pedía el informe, pero deja a la moderación comparando a una persona con una cadena nacional sin ninguna señal para decidir: es mejor no ofrecer el camino.
- **Solo el tipo `descuento`.** Deja pasar a Éxito, Olímpica o Carulla, que en la semilla son `supermercado`.
- **Lista en la base de datos o en una variable de entorno.** Es una lista corta y estable que se revisa con el código y se prueba; una tabla agregaría una migración y una ruta de administración sin necesidad.
- **Coincidencia por subcadena.** «Ara» aparecería dentro de «Aracely»; la palabra completa evita falsos positivos.
- **Bloquear de nuevo a quien fue rechazado.** Se descartó por ahora (ver riesgos). La revocación de un moderador sigue bloqueándola (D3, #208).

## Consecuencias y riesgos

- **Falsos negativos.** Una cadena que no esté en la lista y esté registrada como `barrio` o `minimercado` se sigue verificando al instante. Mercamos (8 sucursales de la semilla, tipo `supermercado`) y Comfenalco no están en la lista: pasan por revisión del moderador, porque son `supermercado`. Se amplía la lista a medida que aparezcan.
- **Falsos positivos.** Un negocio de barrio cuyo nombre contenga una palabra de la lista («Metro», «Ara») no se puede reclamar; la persona recibe el 422 y puede pedir ayuda al moderador. Es el error menos costoso.
- **El rechazo de un reclamo no bloquea volver a reclamar** la misma tienda: la cuenta puede abrir otro caso. Está acotado (una tienda por cuenta a la vez) y el moderador ve el historial; si se vuelve un problema, `wasRevokedFrom` puede incluir el resultado `rechazado`.
- **Una tienda `descuento` o de cadena que ya tenía dueño** (verificado antes de esta regla) lo conserva: este ADR no retira comercios existentes. Revisarlos, si hace falta, es una decisión de moderación (revocar).
- **El motivo del moderador lo ve la cuenta** en `GET /v1/commerce/me` cuando se rechaza, igual que con la tienda propuesta rechazada: debe escribirse pensando en esa lectura (hallazgo H15).
- Una tienda **nueva** propuesta con nombre de cadena (`newEstablishment`) no se bloquea todavía: su flujo no cambia por decisión del equipo, y el moderador la ve al aprobar la propuesta.
- Contrato nuevo para el frontend: `CHAIN_STORE_NOT_CLAIMABLE` y `DECISION_NOT_APPLICABLE` (422), `201 { status: "pre_aprobado" }` en una tienda del mapa, caso `reclamo` y decisiones `aprobar` y `rechazar`. Ver `docs/openapi.yaml`.
