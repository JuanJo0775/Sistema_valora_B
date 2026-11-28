# AS-E4 · Análisis de impacto y arquitectura v2 — enlace y brechas

> **Entregable 4 de Arquitectura de Software II · Corte 2.** Efecto del módulo comercial sobre la arquitectura, componentes afectados, **estimación de esfuerzo antes de modificar**, arquitectura actualizada y ADR nuevos o reemplazados (Guía §8 Fase 4, §9 Corte 2). Base del escenario EC-05.
>
> **El contenido vive en Notion** (página `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`, preanálisis del 16-nov redactado por Sara Valentina Sánchez Estrada; secciones 5 y 6 propuestas el 16-nov). Este archivo **no copia ni reescribe** esas secciones. **No contiene cifras de esfuerzo**: se dejan a propósito sin llenar (decisión de JuanJo del 16-nov).
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Qué hay y qué falta

- **Hecho (Notion, secciones 1 a 3):** preanálisis con el código actual: lo que el núcleo ya tiene listo para `commerce` (regla de la CI, outbox, `promotions`, `source`, rol `comercio`) y los componentes que se verían afectados, con sus riesgos.
- **Cierre final (27-nov-2026):** la arquitectura v2 y los ADR-023 a ADR-028 fueron aceptados como parte del cierre del proyecto. Las notas siguientes conservan la fotografía histórica de su elaboración y los ajustes hechos durante la construcción.
- **En blanco a propósito (Notion, sección 4):** la tabla de horas. El equipo la estima el **23-nov**, después de la presentación del docente y antes del primer commit del módulo, para que EC-05 mida la estimación frente al esfuerzo real. **La estimación sigue pendiente.**

**Actualización del 26 de noviembre de 2026 (B#210).** Los ADR-023 a ADR-028 ya están en `docs/adr/` como «Propuesto», redactados según el código construido y las decisiones del grill (`docs/decisiones/epic-8-modulo-comercial/grill.md`). Dos se apartan del borrador de este análisis: **ADR-023** (el precio oficial llega por el outbox diferido, no «en la misma transacción») y **ADR-028** (el contrato no usa `oneOf` ni `discriminator`); además, ADR-024 calcula las discrepancias al leer y ADR-027 identifica los productos por código de barras. Cada ADR conserva las diferencias respecto del borrador y las verificaciones que correspondan. Al cierre final, los seis ADR están aceptados; las brechas técnicas se mantienen como consecuencias o evidencia pendiente, no como propuestas abiertas. Se actualizaron las fuentes `.mmd` de los diagramas 02, 03, 06, 08, 12 y 13; **las imágenes `.png` hay que volver a generarlas** con `npx @mermaid-js/mermaid-cli` (README de `docs/diagramas/`), igual que la del 04.

## 2. Resumen de la propuesta v2 (el detalle está en Notion)

- `commerce` entra como módulo del monolito (ADR-001) con esquema propio (ADR-021); depende del núcleo solo por `index.ts` y el núcleo no lo importa (regla `nucleo-no-conoce-commerce`, medida en la CI).
- El núcleo se entera de lo comercial solo por eventos versionados (`OfficialPricePublished`, `PromotionPublished`, `PromotionWithdrawn`, `MerchantVerified`, `OfficialPriceWithdrawn`); ningún evento existente cambia de versión.
- Componentes modificados: `comparison` (tablas de lectura nuevas, receptores, tres casos de uso y contrato de respuesta), `reliability` (motivo `discrepancia_oficial` y dos exportaciones), `identity` (un receptor), posiblemente `establishments` (decisión del equipo), el bus de eventos (entrega en la transacción) y `docs/openapi.yaml`. `pricing`, `catalog` e `imports` no cambian.
- Ningún ADR existente se reemplaza; unos se mantienen y otros se ajustan (004, 005, 013, 015, 016, y 022 solo si la evidencia es un archivo).
- ADR propuestos: 023 (entrega del precio oficial en la misma transacción), 024 (regla oficial frente a reportado como función pura), 025 (verificación de comercios y rol por evento), 026 (promociones y vencimiento por fecha), 027 (carga CSV), 028 (contrato de comparación con fuente oficial).

## 3. Decisiones del equipo que quedan abiertas

Sin respuesta en las fuentes; se listan con sus opciones en la sección 6 de la página de Notion:

1. Qué precio entra al orden cuando hay discrepancia corroborada (ADR-024).
2. Cómo se prueba que alguien es dueño de un comercio (ADR-025).
3. Una cuenta, un rol (ADR-025); cuántas tiendas por cuenta; qué pasa con precios y promociones si se revoca un perfil.
4. Periodo de reconfirmación del precio oficial (ADR-005).
5. Bucket privado para evidencias (ADR-022 / ADR-012) y si una corrección aprobada cambia datos de la tienda por sí sola (`establishments`).
6. Promociones: precio especial sin oficial, promoción con precio desactualizado, contenido de `conditions` (ADR-026).
7. Límite de filas del CSV y paso de `202` a `200` (ADR-027).
8. Si los oficiales entran al historial de 30 días.

Cerrar las decisiones 1 y 2 antes de estimar evita que la estimación dependa de decisiones abiertas.

## 4. Estado verificable en el repositorio

| Elemento | Verificado | Fuente |
|---|---|---|
| Rutas `/commerce/*` | 4 rutas declaradas con `x-corte: 3`, sin código en `src/modules/commerce` (la carpeta no existe) | `docs/openapi.yaml` |
| Reserva en el núcleo | `promotions: []` aparte de `results` y `source` por resultado | `src/modules/comparison/application/compare-product.ts` |
| Diagramas desactualizados con la v2 | `13-evolucion` (dice «SIN CAMBIOS» en `reliability` e `identity`), `08-sec-oficial` (llamada directa), `02-c4-contenedores` (proxy Caddy), `03-c4-componentes` (`ScoreActualizado`): **fuentes `.mmd` actualizadas el 26-nov-2026 (también 06 y 12); falta regenerar los `.png`** | `docs/diagramas/` |
| ADR relacionados | ADR-008, ADR-009 y ADR-016 figuran «Propuesto» en Notion; ADR-004 también (ver encabezado de su archivo) | `docs/adr/` |

## 5. Honestidad de EC-05

Las rutas comerciales **ya están en el contrato** (corte 3), pero no hay código del módulo. Si el equipo estima el 23-nov y empieza a modificar después, la estimación es anterior a la modificación. `PENDIENTE (equipo)`: dejar constancia de la fecha de la estimación y de que no se ha iniciado código del módulo, para que no se lea como estimación hecha a posteriori.

## 6. Pendientes y riesgos

- Estimación de esfuerzo: `PENDIENTE (equipo)`, método y cifras del 23-nov. Este archivo no propone ninguna.
- Revisar y aceptar o descartar ADR-023 a 028; aceptar antes ADR-004, ADR-008 y ADR-009, si el equipo confirma su estado.
- Regenerar los diagramas 02, 03, 08 y 13 y actualizar `docs/ARCHITECTURE.md` (reglas 8 a 11) en la misma rama que los ADR.
- Los RF comerciales RF-015 a RF-018 están «Por definir» en Notion; el requerimiento del docente (23-nov) puede cambiar esta propuesta.
- Riesgos de la evolución (R1 a R12) y lo no determinable con la información disponible: secciones 6.4 y 6.5 de la página de Notion.

## 7. Fuentes de referencia

- Notion: AS-E4 `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`; RF y escenarios EC-05 y EC-06.
- Repo: `docs/openapi.yaml`, `docs/diagramas/`, `docs/adr/`, `docs/academico/as-e5-sistema-integrado.md`, `docs/academico/as-e6-evaluacion-final.md`, `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md`.


## Estado al cierre final — 27-nov-2026

Los ADR-023 a ADR-028 constan Aceptados en el cierre del proyecto. Las secciones que los describen como Propuestos son registros históricos del momento de análisis y no deben interpretarse como estado vigente. La aceptación no cambia los umbrales ni convierte en cumplidas las verificaciones que el propio ADR deja pendientes.
