# ADR-042: El precio en línea es una fuente aparte del precio por sede

- **Estado:** Propuesto
- **Fecha:** 2026-11-25
- **Responsables:** equipo de backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-02 (vigencia), EC-03 (confiabilidad), EC-05 (evolución), EC-06 (fuente visible), EC-08 (privacidad)
- **Requisitos relacionados:** RF-008, RF-009, RF-010, ADR-008 (oficial frente a reportado), ADR-009 (neutralidad), ADR-013 (privacidad), ADR-041 (cierre de la integración con Olímpica)

## Contexto

El grill de Olímpica pidió un ADR que separara el precio en línea del precio por tienda física. Los términos de Olímpica (cláusula 5.3) confirman la razón: los precios del canal digital pueden ser exclusivos y no siempre coinciden con los de las sedes. Aunque la integración con Olímpica se cerró (ADR-041), el modelo ya existe y servirá a cualquier fuente en línea autorizada.

## Decisión

1. Un precio en línea es una **observación** de una fuente para una **zona de entrega** y una presentación. Vive en `imports.online_observations`, con historial, y no en `pricing` ni en `comparison.price_current`.
2. **No es** precio oficial de una sede (ADR-008) ni reporte comunitario. No entra al score, a las anomalías ni a la reputación (EC-03), ni al orden neutral de la comparación (ADR-009).
3. Se muestra aparte, con **fuente, zona y fecha** (EC-06), mediante `GET /v1/products/{productId}/online-offers`.
4. Vigencia de 48 horas desde la última confirmación válida; una indisponibilidad confirmada retira la oferta de inmediato y el historial se conserva (EC-02).
5. La zona es una zona de entrega de prueba o configurada, nunca la ubicación de una persona (ADR-013, EC-08).
6. La respuesta está apagada (`ONLINE_OFFERS_ENABLED` falso, devuelve `[]`) hasta que exista una fuente con autorización escrita (ADR-041).

## Alternativas descartadas

- **Guardarlo como precio oficial de la sede.** Mezcla un canal con otro y contradice la cláusula 5.3 de Olímpica.
- **Guardarlo como reporte comunitario.** Contamina el score y la detección de anómalos con un dato que no tiene reportante.
- **Entrar al orden de la comparación.** Rompe el orden neutral (ADR-009).

## Consecuencias

- (+) Fuentes en línea nuevas se agregan sin tocar el núcleo (EC-05).
- (−) El usuario ve dos precios distintos para un mismo producto; la pantalla debe explicar la fuente y la zona.
- Incorporar el precio en línea al orden o a «Dónde comprar» requiere un ADR posterior.
