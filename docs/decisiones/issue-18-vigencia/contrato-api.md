# Contrato API — issue #18: estado de vigencia (RF-010)

Esta issue no agrega ni quita rutas. Solo alinea los nombres de los estados de vigencia del contrato con RF-010 y ADR-005 (grill, pregunta 1).

## Cambios en `docs/openapi.yaml`

| Lugar | Antes | Después | Razón |
|---|---|---|---|
| `ComparisonItem.freshness` | `enum: [vigente, por_vencer, vencido]` | `enum: [vigente, por_confirmar, desactualizado]` | Nombres de RF-010 y ADR-005. «Por vencer» describía otra cosa: entre 1 y 2 TTL el precio ya pasó su plazo y necesita confirmación. |
| `ComparisonItem.freshness` | sin descripción | descripción con los límites: vigente si edad ≤ TTL; por confirmar si TTL < edad ≤ 2 TTL; desactualizado si edad > 2 TTL, y en ese caso no entra a la comparación | Que el frontend sepa qué significa cada valor sin leer el código. |
| Parámetro `onlyCurrent` de la comparación | «Si es verdadero, excluye precios por vencer.» | «Si es verdadero, solo incluye precios vigentes (excluye los por confirmar).» | Mismo cambio de nombre. |
| `averagePriceCop` | «Solo precios vigentes y por vencer.» | «Solo precios vigentes y por confirmar.» | Mismo cambio de nombre. |

## Impacto

- **Frontend (`Sistema_valora_F`):** cuando consuma `freshness`, debe usar `por_confirmar` y `desactualizado`. Hoy no hay código que lo use.
- **Compatibilidad:** ningún cliente consume todavía la comparación, así que no se rompe nada.
- **Prueba de contrato:** llegará con la issue #25. Por ahora el cambio se revisa en el pull request.
