# ADR-026: Promociones: reglas en el dominio, lectura propia en `comparison`, estado calculado al leer

- **Estado:** Aceptado (cierre final del proyecto, 2026-11-27)
- **Fecha:** 2026-11-26 (grill del 21-nov-2026 y precisiones al construir B6 el 22-nov; ajustado al código)
- **Responsables:** equipo de backend; la aceptación la decide el equipo. No hay constancia en el repositorio de la validación con el docente del 23-nov.
- **Escenarios relacionados:** EC-06, EC-05
- **Requisitos relacionados:** RF-017 (RN1 a RN5), RNF-006. Mantiene ADR-009; ajusta ADR-015 (se retira `PromocionVencida`).

## Contexto

RF-017 pide tres tipos de promoción con reglas, vigencia con vencimiento automático, condiciones visibles (Ley 1480 de 2011) y que nunca alteren el orden de la comparación. ADR-009 ya manda que las promociones viajen en un arreglo `promotions`, aparte de `results`. ADR-015 mencionaba un evento `PromocionVencida`.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Mezclar las promociones en los resultados con una etiqueta | Un solo arreglo | Rompe la neutralidad del orden (descartada ya en ADR-009) |
| B. `comparison` consulta las promociones de `commerce` al leer | Sin copia | Mismas razones que ADR-023 C: `comparison` leería otro esquema en el camino caliente (EC-04) |
| C. Un trabajo programado publica `PromocionVencida` | El vencimiento es un hecho explícito | Un proceso más que operar y un retraso entre el fin de la vigencia y el ocultamiento |
| D. Eventos `PromotionPublished` y `PromotionWithdrawn` a una tabla propia de `comparison`, con el estado calculado al leer | Sin procesos extra, sin retraso en el vencimiento, nada que sincronizar | Las promociones que aún no empiezan quedan guardadas y se filtran al consultar |

## Decisión

Se adopta la D.

1. **Reglas en el dominio:** `src/domain/promotion.ts` (probada con TDD). Tres tipos: descuento porcentual (entero de 1 a 90), precio especial (menor que el oficial y de al menos $100) y «pague X lleve Y» (Y mayor que X). `commerce` las aplica al publicar y responde 422 con la regla incumplida.
2. **Exigen un oficial vigente.** Sin precio oficial vigente del producto no hay promoción. Si el oficial pasa a «por confirmar», la promoción **se pausa sola**; reconfirmar (ADR-005, D4) la reactiva. Así el «antes» siempre es un precio real y reciente (EC-06).
3. **El estado se calcula al leer** con la vigencia del oficial y las fechas: no se guarda. Una promoción con fecha de inicio futura queda «programada» y la comparación no la muestra hasta que empiece.
4. **Duración máxima de 30 días** (valor provisional, en un solo lugar): una promoción de meses es un precio normal disfrazado de descuento.
5. **Condiciones fijas, sin texto libre:** máximo por cliente (1 a 99), hasta agotar existencias (sí/no) y medio de pago (cualquiera, efectivo o tarjeta). Sin publicidad ni datos personales, y nada que moderar.
6. **Lectura propia:** `commerce` publica `PromotionPublished` y `PromotionWithdrawn` (versión 1); `comparison` los guarda en `comparison.promotions` y adjunta las promociones vigentes por fecha (hora de Colombia) **después** de ordenar los resultados. No existe ningún campo que permita posicionamiento pago (RF-017 RN5).
7. Se retira todo si se revoca el perfil o se elimina la cuenta (ADR-025).

## Consecuencias

- Positivas: EC-06 se comprueba de forma automática y la regla de neutralidad se cumple por construcción; menos procesos que operar; el vencimiento es exacto.
- Negativas / riesgos: una promoción nueva tarda lo que tarde el repartidor del outbox (segundos, ADR-023) en verse; las programadas ocupan espacio en la lectura hasta que empiezan.
- Trade-offs aceptados: ninguno relevante; el estado calculado evita sincronizar una pausa o un vencimiento.

## Verificación

- `src/domain/promotion.spec.ts`: reglas de los tres tipos.
- `src/modules/commerce/application/create-promotion.spec.ts`, `merchant-promotions.spec.ts`, `withdraw-promotion.spec.ts`.
- `src/modules/comparison/application/compare-product.spec.ts`: «los resultados son idénticos con y sin promociones» (ADR-009).
- El contrato de `Promotion` y de `PromotionConditions` está en `docs/openapi.yaml`, pero la prueba de contrato (`test/contract/commerce.contract.spec.ts`) cubre los precios oficiales y la carga por archivo, **no las promociones**: es una brecha de verificación.

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-026).
- Documentos: `docs/decisiones/epic-8-modulo-comercial/grill.md` (D6). ADR-005, ADR-009, ADR-023.
- Issues / PRs: B#206 (promociones), B#210 (este registro).
