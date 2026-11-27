# ADR-024: Precio oficial frente al reportado: regla pura, mediana corroborada y aplicada al leer

- **Estado:** Propuesto
- **Fecha:** 2026-11-26 (grill del 21-nov-2026 y precisiones al construir B4 y B9 el 22-nov; ajustado al código)
- **Responsables:** equipo de backend; la aceptación la decide el equipo. No hay constancia en el repositorio de la validación con el docente del 23-nov.
- **Escenarios relacionados:** EC-02, EC-03, EC-05, EC-06
- **Requisitos relacionados:** RF-018 (RN1 a RN5), RF-015 (RN5). Completa ADR-008.

## Contexto

ADR-008 decide la regla de fondo: el precio oficial es la referencia; hay discrepancia con una diferencia mayor al 5 % sostenida por reportes independientes, recientes y de confiabilidad suficiente. No decide dónde vive la regla, quién la aplica, con qué datos ni qué precio entra al orden cuando hay discrepancia. `comparison` solo guarda un reporte por tienda en `price_current`, pero la regla necesita varios reportes por cuenta con su confiabilidad, que están en `reliability`.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Calcular al escribir y guardarlo en `comparison` | Lectura rápida | La confiabilidad y la actualidad cambian con el tiempo: lo guardado se pondría viejo |
| B. Que `reliability` conozca el oficial y marque las discrepancias | Un solo dueño de la confiabilidad | Recibiría datos comerciales y dependería conceptualmente de `commerce` |
| C. Que `commerce` calcule y publique la integración | Cerca de quien avisa | El orden y lo mostrado dependerían del módulo con interés comercial: difícil de defender ante EC-06 |
| D. Función pura en `domain`, aplicada por `comparison` al leer con datos de `reliability` por su interfaz pública | Una sola regla probada con TDD, sin estado guardado, neutral | Una consulta más por cada tienda con oficial (EC-04) |

## Decisión

Se adopta la D. Decisiones del grill (D1) y sus precisiones al construir:

1. **Qué precio entra al orden con discrepancia:** el que corrobora la comunidad, no el oficial. El oficial se muestra al lado, con aviso, fuente y fecha. Vale igual si el reporte es más caro o más barato.
2. **Qué valor:** la **mediana** de los reportes que corroboran; con un número par, el menor de los dos centrales. Un reporte extremo no la mueve.
3. **Qué es «reciente»:** dentro de la vigencia de la categoría (ADR-005) **y posterior a la última actualización del oficial**.
4. **Cuándo hay discrepancia:** solo con **2 o más** reportes del mismo lado (todos más caros o todos más baratos, a más de 5 %) y que sean **más** que los reportes recientes que coinciden con el oficial. Un reporte más caro y otro más barato no corroboran lo mismo.
5. **«Última actualización» del oficial:** cuando el comercio **cambia el precio**; reconfirmar no reinicia la cuenta.
6. **Dónde vive:** `src/domain/official-vs-reported.ts` (`officialVsReported`, parámetros en `DISCREPANCY_PARAMS = { threshold: 0.05, minReports: 2 }`). Un reporte cuenta como confiable si su nivel no es `baja`.
7. **Quién la aplica:** `comparison`, al leer (`resolveOfficial`), con los reportes de la tienda que le entrega `reliability` por su interfaz pública (un reporte por persona, con su nivel, sin claves). La misma regla alimenta la comparación, los precios por tienda y, por una puerta de entrada pública de `comparison` (`OfficialDiscrepancies`), los avisos al comercio (B9). `commerce` importa del núcleo, nunca al revés.

**Diferencias con el borrador de AS-E4**, por si alguien lo compara: no existe `ReportedEvidence` ni una vigilancia que escuche `PriceAssessed`; las discrepancias se calculan al leer (también en los avisos, que llegan con hasta una hora de retraso, ADR-044). El motivo `discrepancia_oficial` está en el contrato de la cola de moderación, pero **ningún código lo produce todavía**: el reporte aislado que se aparta del oficial no se envía a revisión por ese camino.

## Consecuencias

- Positivas: una sola regla, probada, para mostrar y para avisar; `reliability` no aprende nada comercial; sin datos guardados que se pongan viejos.
- Negativas / riesgos: una consulta más a `reliability` por cada oficial al construir la comparación; el aviso de discrepancia no es inmediato; el motivo `discrepancia_oficial` queda declarado sin usar.
- Trade-offs aceptados: más lectura a cambio de una regla sin estado y neutral.

## Verificación

- `src/domain/official-vs-reported.spec.ts`: mediana (par, impar, extremo), recientes y posteriores, umbral de 5 %, mismo lado.
- `src/modules/comparison/application/compare-product.spec.ts`: la comparación con oficial y con discrepancia, y «los resultados son idénticos con y sin promociones» (ADR-009, EC-06).
- El objeto `discrepancy` está en el contrato (`PriceDiscrepancy` en `docs/openapi.yaml`), pero ninguna prueba de contrato lo ejercita todavía: `test/contract/commerce.contract.spec.ts` cubre los precios oficiales, no la comparación con discrepancia.

## Referencias

- Notion: AS-E4 (sección 6.2, borrador de ADR-024).
- Código: `src/modules/comparison/application/official-resolution.ts`, `official-discrepancies.ts`.
- Documentos: `docs/decisiones/epic-8-modulo-comercial/grill.md` (D1). ADR-005, ADR-008, ADR-009.
- Issues / PRs: B#204 (comparación con oficial), B#209 (avisos), B#210 (este registro).
