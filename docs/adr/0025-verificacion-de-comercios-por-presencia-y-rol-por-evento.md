# ADR-025: Verificación de comercios por presencia, un rol por cuenta y revocación que retira lo publicado

- **Estado:** Aceptado (confirmación del equipo: 2026-11-28; reunión con el docente realizada, fecha no informada)
- **Fecha:** 2026-11-26 (grill del 21-nov-2026 y precisiones al construir B8 y B7 el 22-nov; ajustado al código)
- **Responsables:** equipo de backend; revisión con el docente confirmada por el equipo, sin cambios a la decisión (fecha de reunión no informada).
- **Escenarios relacionados:** EC-08, EC-05, EC-03
- **Requisitos relacionados:** RF-015 (RN1 a RN5), RF-005 (RN7), RF-002, RNF-007, RNF-010. Relacionado con ADR-032, ADR-038 y ADR-040.

## Contexto

RF-015 pide que un dueño reclame su tienda, que algo valide su propiedad antes de publicar precios oficiales y que se pueda corregir lo que se publica. EC-08 incluye suplantar a un comercio. Cada cuenta tiene un solo rol, el registro crea siempre un `reportante` y solo el `reportante` registra precios. El equipo no puede revisar cada solicitud ni hacer videollamadas, y los comercios objetivo incluyen tiendas informales sin papeles. Los borradores de AS-E4 dejaron abierta la prueba de propiedad y la política de roles.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Documentos y revisión de cada solicitud por un moderador | Evidencia fuerte | No escala con el equipo; guarda documentos (Ley 1581); excluye tiendas informales; exigiría un bucket privado |
| B. Verificación por presencia: el celular comparte su ubicación una vez y debe estar a 50 m o menos de la tienda | Para suplantar hay que estar en la tienda; gratis; incluye tiendas informales; la ubicación se usa y **no se guarda** | No es infalible (la ubicación se puede falsear): lo cubren las denuncias |
| C. Cola de moderación de `reliability` con el motivo `verificacion_comercio` | Reutiliza una cola | La decisión tendría que volver a `commerce` con un evento de semántica comercial, o `reliability` importaría `commerce` (prohibido) |

## Decisión

Se adopta la B, con moderación solo por excepción y dentro de `commerce`.

1. **Registro:** formulario en `/comercios/registro` con validaciones automáticas: tienda existente y sin dueño, responsable, NIT con dígito de verificación (opcional para tiendas informales), teléfono, dirección, aceptación de condiciones, correo verificado, **una tienda por cuenta**. No guarda documentos.
2. **Prueba de propiedad:** presencia a 50 m o menos, comprobada una vez; la ubicación no se guarda.
3. **Tienda que no está en el mapa:** se propone en el mismo formulario y pasa por la revisión de propuestas de tiendas que ya existe (RF-005 RN7). El comercio queda «pre-aprobado» y, al aprobarse la tienda, queda verificado solo. Las tiendas de cadena no se reclaman (ADR-038).
4. **Moderador solo por excepción:** una disputa (dos cuentas reclaman la misma tienda) o una denuncia («este comercio no es de quien dice»). Puede revocar el perfil. Una disputa se abre sola cuando alguien que **está en la tienda** intenta registrar una que ya tiene dueño; sigue respondiendo 409. Una denuncia no puede ser a la tienda propia, solo a tiendas con dueño y una abierta por cuenta y tienda.
5. **Un rol por cuenta:** al verificarse, la cuenta pasa de `reportante` a `comercio` con el evento `MerchantVerified` (versión 1), que `identity` aplica con su bitácora `role_changes` (`grant-merchant-role`, `revoke-merchant-role`). Un comercio ya no reporta precios de otras tiendas (evita el conflicto de interés, EC-03); sus reportes anteriores se conservan.
6. **Revocación (suplantación confirmada) o cuenta eliminada (ADR-032):** se retira todo al instante: precios oficiales y promociones dejan de mostrarse (`OfficialPriceWithdrawn`, `PromotionWithdrawn`), `comparison` vuelve a los reportes y datos iniciales y la tienda sigue en el mapa. El comercio ve «Revocado» con el motivo; queda quién revocó, cuándo y por qué. La cuenta vuelve a `reportante`. Con `AccountPurged`, `commerce` borra la solicitud, el historial y los casos de esa cuenta. Un comercio revocado no puede volver a registrar **esa** tienda; otras sí, estando en ellas.
7. **Datos de la tienda (D5):** un comercio verificado cambia horario, teléfono y nombre al instante; si el nombre nuevo es equivalente al de otra tienda a menos de 50 m, o si cambia la **ubicación**, va a la cola de propuestas de tiendas con un tipo «corrección». `commerce` pide los cambios a `establishments` por su interfaz pública. El horario se escribe por día, sin texto libre. No hace falta un bucket privado.
8. **Control por recurso:** cada caso de uso de `commerce` actúa solo sobre la tienda de la cuenta; solo un comercio verificado publica (`MERCHANT_NOT_VERIFIED`, 403).

## Consecuencias

- Positivas: sin documentos ni datos personales nuevos; `reliability` no cambia su límite; `identity` solo gana receptores; el moderador solo actúa por excepción; revocar tiene efecto inmediato y auditable.
- Negativas / riesgos: la presencia se puede falsear con una ubicación simulada (se mitiga con denuncias y la revocación); hasta que el repartidor entregue `MerchantVerified` la cuenta sigue con su rol anterior (segundos); el moderador tiene una lista más (denuncias, disputas y reclamos de supermercado).
- Trade-offs aceptados: una prueba de propiedad más débil que un documento, a cambio de privacidad, escala e inclusión de tiendas informales.

## Verificación

- `claim-establishment.spec.ts`, `claim-proposed-establishment.spec.ts`, `decide-merchant-case.spec.ts`, `leave-establishment.spec.ts`, `purge-merchant-account.spec.ts` en `src/modules/commerce/application/`.
- `test/integration/commerce-claims-http.spec.ts`, `commerce-cases-http.spec.ts`, `commerce-leave-http.spec.ts`.
- Matriz de autorización del rol `comercio` (`docs/calidad/matriz-autorizacion.md`) y prueba del esquema `commerce` en el guardián de privacidad (EC-08).

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-025).
- Documentos: `docs/decisiones/epic-8-modulo-comercial/grill.md` (D2, D3, D5).
- Issues / PRs: B#201, B#202, B#207, B#208 y B#210 (este registro). ADR-014, ADR-022, ADR-032, ADR-038, ADR-040.


## Aceptación y evidencia — 28-nov-2026

La reunión con el docente fue confirmada por el equipo; no se modificó la decisión prevista. La fecha exacta de la reunión no fue informada y no se sustituye la fecha original del ADR (26-nov-2026).

La implementación está respaldada por los casos HTTP de reclamo, disputas, salida y revocación (`commerce-cases-http.spec.ts`, `commerce-claims-http.spec.ts`, `commerce-leave-http.spec.ts`), además de la matriz de autorización (`docs/calidad/matriz-autorizacion.md`). La aceptación cubre el modelo de verificación por presencia, un rol por cuenta y retiro de precios/promociones al revocar o eliminar. Se mantiene explícita la limitación de que la ubicación puede falsearse; denuncias y disputas son controles complementarios.
