# ADR-028: Contrato de la comparación con precio oficial, discrepancia y promociones

- **Estado:** Aceptado (confirmación del equipo: 2026-11-28; reunión con el docente realizada, fecha no informada)
- **Fecha:** 2026-11-26 (borrador de AS-E4 del 16-nov-2026; ajustado al contrato construido en B4 y B6)
- **Responsables:** equipo de backend y de frontend; revisión con el docente confirmada por el equipo, sin cambios a la decisión (fecha de reunión no informada).
- **Escenarios relacionados:** EC-06, EC-08, EC-05
- **Requisitos relacionados:** RF-016, RF-017, RF-018, RNF-012 (transparencia del origen). Ajusta ADR-002 y ADR-009.

## Contexto

`ComparisonItem` exigía `reportId` (sirve para marcar un reporte, RF-013), pero un precio oficial no viene de un reporte. RF-018 pide mostrar «publicado por el comercio» y, con discrepancia, ambos valores con fuente y fecha. La prueba de contrato valida las respuestas públicas en modo estricto: un campo no declarado hace fallar la CI. El frontend genera sus tipos desde `openapi.yaml`.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Hacer `reportId` opcional y documentar cuándo viene | El cambio más pequeño; aditivo para el cliente | El tipo no impide que un cliente intente marcar un oficial; la regla vive en la descripción |
| B. Una lista aparte `officialResults` | Tipos separados | Dos órdenes: rompe la neutralidad en la interfaz (EC-06 pide un solo orden con criterios declarados) |
| C. Versión nueva `/v2` de la comparación | Contrato limpio | Duplica rutas para un cambio pequeño con un contrato todavía preliminar |
| D. `ComparisonItem` discriminado con `oneOf` y `discriminator` por `source` | El tipo dice exactamente qué se puede marcar | Más complejo de generar y de consumir; el frontend debe manejar dos formas |

## Decisión

Se construyó la A. El borrador de AS-E4 proponía la D (`oneOf` y `discriminator`); el contrato actual no los usa.

1. `ComparisonItem` mantiene un solo orden. `source` es `comunidad`, `oficial` o `siembra` (datos iniciales). `reportId` es opcional: **un precio oficial viene sin `reportId`, sin `reliability` y sin `confirmations`**; solo un precio de la comunidad trae su `reportId` y puede marcarse. `observedAt` en un oficial es su última confirmación.
2. `discrepancy` es opcional y solo aparece con discrepancia corroborada (ADR-024): `PriceDiscrepancy` con `officialPriceCop`, `reportedPriceCop` (la mediana de los reportes que corroboran), `reports` (mínimo 2) y `since` (el más antiguo). El precio que entra al orden es el reportado, y el oficial se muestra al lado.
3. `Promotion` va en el arreglo `promotions`, aparte de `results` (ADR-009), con `validFrom` y `validUntil` obligatorios y `conditions` (`PromotionConditions`: máximo por cliente, hasta agotar existencias y medio de pago). Nunca altera el orden (ADR-026).
4. Ninguna respuesta lleva datos de la cuenta del comercio (solo la tienda) ni de los reportantes (EC-08, RNF-007).

## Consecuencias

- Positivas: cambio aditivo para el cliente (los campos nuevos son opcionales); un solo orden y criterios declarados; el origen de cada precio es visible (RNF-012).
- Negativas / riesgos: el tipo generado no impide marcar un oficial: el frontend debe comprobar que exista `reportId`; la regla vive en las descripciones del contrato y no en el tipo; si el equipo prefiere la D, es un cambio de contrato que obliga a tocar el frontend.
- Trade-offs aceptados: menos garantía de tipos a cambio de no romper a los clientes ni complicar el contrato mientras es preliminar.

## Verificación

- Prueba de contrato en modo estricto: `test/contract/responses.contract.spec.ts` y `commerce.contract.spec.ts` (precios oficiales y carga por archivo).
- **Brecha:** ninguna prueba de contrato ejercita todavía `discrepancy` ni `promotions` en la comparación.
- Frontend: tipos generados con `pnpm api:types` desde este contrato.

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-028).
- Documentos: `docs/openapi.yaml` (`ComparisonItem`, `PriceDiscrepancy`, `Promotion`, `PromotionConditions`). ADR-002, ADR-009, ADR-024, ADR-026.
- Issues / PRs: B#204 (comparación con oficial), B#206 (promociones), B#210 (este registro).


## Aceptación y evidencia — 28-nov-2026

La decisión de mantener un solo orden y usar campos aditivos para `source`, `reportId`, `discrepancy` y `promotions` se mantiene sin cambios tras la reunión con el docente confirmada por el equipo. Se conserva la fecha original del ADR (26-nov-2026).

La evidencia está en `docs/openapi.yaml`, los tipos generados del frontend (`pnpm api:types`) y las pruebas de contrato estrictas para precios oficiales y carga por archivo. `compare-product.spec.ts` cubre la comparación con precios oficiales, discrepancias y promociones.

**Brecha conservada:** la prueba de contrato aún no ejercita `discrepancy` ni `promotions` en la respuesta de comparación. El ADR se acepta como decisión del contrato; esa cobertura no se declara completada.
