# Plan — issue #18: estado de vigencia por TTL (RF-010)

- **Objetivo:** una regla pura que, a partir de la fecha de observación, el momento actual y el TTL, dice si un precio está `vigente`, `por_confirmar` o `desactualizado`.
- **Requisitos:** RF-010 (RN1 y RN2), EC-02, EC-03, ADR-005 (aceptado), PR-02. Épica #5 (EPIC-B05).
- **Fuera de alcance:**
  - Los niveles de confiabilidad y el score (RF-010 RN3 a RN5 y RF-011).
  - La configuración de los TTL 7 y 14.
  - La categoría de cada producto.
  - El uso de la regla en la comparación (paso 6).

## Rama y pull request

`feat/domain-vigencia`, que sale de `dev`. Un pull request hacia `dev` con `Closes #18`.

## Diseño

- **Archivos:** `src/domain/freshness.ts` y `src/domain/freshness.spec.ts`, sin dependencias externas.
- **Firma:** `freshnessOf({ observedAt: Date, now: Date, ttlDays: number }): 'vigente' | 'por_confirmar' | 'desactualizado'`.
- **Cálculo:** la edad es `now − observedAt` en milisegundos, y el TTL es `ttlDays × 24 h`.
- **Errores** (todos heredan de `DomainError`):
  - `InvalidObservationDateError`: la fecha es posterior a `now` o no es una fecha válida.
  - `InvalidTtlError`: el TTL no es un número finito mayor que cero.

## Pasos

1. **Refactor previo, en verde:** sacar `DomainError` de `unit-price.ts` a `src/domain/domain-error.ts`, para que la usen las dos reglas. Commit `refactor(domain)`.
2. **Ciclos TDD:** un comportamiento por ciclo, con commits `test(domain)` y luego `feat(domain)`, más un `refactor(domain)` si hace falta.
   1. Producto fresco (TTL 7 días) reportado hace 3 días → `vigente` (escenario 1 de RF-010).
   2. Producto no fresco (TTL 14 días) reportado hace 20 días → `por_confirmar` (escenario 2 de RF-010).
   3. Reportado hace más del doble de su TTL → `desactualizado` (escenario 3 de RF-010).
   4. Límites con TTL 7:
      - exactamente 7 días → `vigente`;
      - 7 días + 1 s → `por_confirmar`;
      - exactamente 14 días → `por_confirmar`;
      - 14 días + 1 s → `desactualizado`.
   5. Fecha de observación 1 s después de `now` → `InvalidObservationDateError`.
   6. Fecha inválida (`new Date('x')`) → `InvalidObservationDateError`.
   7. TTL de 0, negativo, `NaN` o infinito → `InvalidTtlError`.
3. **Contrato:** aplicar los cambios de `contrato-api.md` en `docs/openapi.yaml`. Commit `docs(api)`.
4. **Diagrama del ciclo de vida** (`docs/diagramas/09-estados.mmd` y su README):
   - Renombrar «Por vencer» a «Por confirmar» y «Vencido» a «Desactualizado».
   - Cambiar «pasan 7 / 14 días» por «pasa 1 TTL / pasan 2 TTL».
   - Quitar la mención a «entrevistas» del README de diagramas. Según la Auditoría, no hubo entrevistas; la calibración depende de evidencia de actualización de precios.
   - Commit `docs(diagramas)`.
5. **Registro:** esta carpeta (`grill.md`, `contrato-api.md` y `plan.md`) y el `README.md` de `docs/decisiones/`. Commit `docs(decisiones)`.

## Criterio de terminado

- `typecheck`, `lint`, `test:cov` (con al menos 80 % de líneas en `domain`), `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- El ciclo rojo → verde visible en los commits.
- `docs/openapi.yaml` actualizado en el mismo pull request.

## Notion (tras abrir y tras mezclar el pull request)

- **RF-010:** pasa a «En construcción» al abrir el pull request. **No** pasa a «Implementado» al mezclar, porque RN3 a RN5 (niveles de confiabilidad) siguen pendientes.
- **[EPIC-B05] en Seguimiento:** se crea o actualiza con el avance de la issue #18.

## Riesgos y pendientes

- **Imagen del diagrama:** `09-estados.png` necesita regenerarse con mermaid-cli, que es una descarga nueva. Si no se autoriza, el PNG queda desactualizado y se anota en el pull request.
- **Paso 5:** margen de tolerancia para fechas futuras.
- **Paso 6:** TTL por categoría (7 y 14 días, provisionales) y el origen de la categoría.
