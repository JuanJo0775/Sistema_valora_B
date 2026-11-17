# AS-E6 · Evaluación de la arquitectura y documento final (esqueleto)

> **Entregable 6 de Arquitectura de Software II · Corte 3 (40 %).** Evaluación basada en escenarios, inspirada en ATAM, con riesgos, puntos de sensibilidad y trade-offs; análisis de cómo respondió la arquitectura al cambio (EC-05) comparando esfuerzo estimado y real; decisiones que el equipo cambiaría y por qué; documento de arquitectura final y registro completo de ADR (Guía §9, «Corte 3», y §8 Fase 5). Este archivo es un **esqueleto**: recoge lo que ya está documentado y marca `PENDIENTE (equipo)` lo que depende de AS-E4 y AS-E5. No hay resultados inventados. La página de Notion `41339c4a-833b-81f4-a681-c8360adaddb8` está sin desarrollo.
>
> Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

## 1. Alcance y criterio de valoración

- La guía valora la calidad de la justificación y la coherencia entre escenarios, decisiones y evidencia, no la tecnología elegida; una decisión inadecuada que el equipo identificó, documentó y corrigió se valora positivamente (Guía §10, criterio transversal).
- Esta evaluación no sustituye el informe de calidad de Modelos de Calidad (ISO/IEC 25040 y 25012). Las mediciones de `docs/calidad/` se usan **solo como referencia** de qué se midió y cuándo.

## 2. Árbol de utilidad (EC-01 a EC-08)

Fuente: base de escenarios de Notion (lectura del 16-nov; EC-01 a EC-06 vienen de la guía y EC-07 y EC-08 son del equipo). La columna «Estado de evidencia» solo dice si existe un archivo o un entregable que la contenga; no declara cumplimiento.

| EC | Atributo de calidad | Escenario (estímulo → respuesta) | Medida y umbral (Notion) | RNF | Prioridad | Estado de evidencia |
|---|---|---|---|---|---|---|
| EC-01 | Usabilidad y eficiencia del registro | Reportante registra un precio frente a la góndola con red limitada. | ≤ 15 s en ≥ 80 % de los intentos, mínimo 8 participantes (meta 10), 3 intentos cada uno. Los 15 s son valor de partida sin medición propia. | RNF-001 | Alta | Depende de la prueba de usabilidad (MC-E4). `PENDIENTE (equipo)`. |
| EC-02 | Frescura del dato oficial | Comercio cambia un precio oficial; la comparación muestra el nuevo. | Retraso ≤ 5 min en el 100 % de 50 cambios; también p95. | RNF-002 | Alta | Requiere módulo comercial (AS-E5). `PENDIENTE (equipo)`. |
| EC-03 | Confiabilidad de datos colaborativos | Usuario o grupo registra precios falsos. | Detección ≥ 80 % sobre 100 reportes (30 anómalos); tasa de falsos positivos registrada; 0 datos poco confiables como vigentes sin advertencia. | RNF-003 | Alta | Medición documentada en `docs/calidad/deteccion-anomalos.md` (referencia). |
| EC-04 | Rendimiento bajo carga | 500 usuarios concurrentes consultan durante 10 min. | p95 ≤ 2 s y errores < 1 %; si no alcanza, carga máxima sostenida. | RNF-004 | Alta | Requiere entorno desplegado (ADR-012, AS-E5). `PENDIENTE (equipo)`. |
| EC-05 | Modificabilidad / extensibilidad | Se incorpora el módulo comercial sobre el núcleo. | Desviación de esfuerzo ≤ 30 % (referencia propuesta); sin cambios en límites de módulos del núcleo; 0 dependencias del núcleo hacia commerce. | RNF-005 | Alta | `PENDIENTE (equipo)`: ver sección 5. |
| EC-06 | Neutralidad del orden | Comercio publica una promoción; el orden no cambia. | 100 % de casos con orden idéntico con y sin promociones; 100 % de promociones etiquetadas y separadas. | RNF-006 | Alta | Función `rankOffers` con pruebas en `src/domain/`; el bloque de promociones aún está vacío (`promotions: []`). Falta la parte comercial. |
| EC-07 | Fiabilidad de la sincronización offline | Registros sin señal se sincronizan al reconectar. | 100 % de 50 registros, 0 duplicados, p95 ≤ 60 s. | RNF-013 | Media | Medición documentada en `docs/calidad/sincronizacion-ec07.md` (referencia). |
| EC-08 | Seguridad y privacidad | Acceso no autorizado o intento de ver la ubicación de un reportante. | 100 % de accesos no autorizados rechazados y registrados (≥ 20 casos por rol); 0 campos personales en respuestas públicas; 0 coordenadas almacenadas; 0 hallazgos críticos o altos sin tratamiento. | RNF-007, RNF-010 | Alta | `docs/calidad/matriz-autorizacion.md` y `docs/calidad/privacidad-ec08.md` (referencia); falta el escaneo de seguridad. `PENDIENTE (equipo)`. |

Otros RNF sin escenario propio (RNF-008, 009, 011, 012, 014) se evalúan en Modelos de Calidad; RNF-009 y RNF-011 dependen del despliegue.

## 3. Riesgos, puntos de sensibilidad y trade-offs ya documentados

Solo se listan los que ya aparecen por escrito en una fuente. La clasificación (riesgo, sensibilidad o trade-off) es del texto original cuando lo dice y, si no, **SUPUESTO:** se asigna aquí por lectura del enunciado, para que el equipo la confirme.

| # | Elemento | Tipo | EC / RNF afectados | Fuente |
|---|---|---|---|---|
| 1 | ADR-012 aceptado en `DECISIONS.md` el 16-nov-2026 (Render, Neon, Vercel); sin despliegue ni URL pública aún (`PENDIENTE (equipo)`). El hosting condiciona los 500 usuarios de EC-04 y la disponibilidad de RNF-011. | Riesgo | EC-04, RNF-009, RNF-011 | ADR-012 en `docs/DECISIONS.md`; EC-04 en Notion |
| 2 | Docker: `Dockerfile` y `render.yaml` ya existen en `dev` (16-nov); el diagrama 12 y Notion aún dicen «sin Docker en el MVP». | Riesgo | RNF-009 | `as-e1-arquitectura-v1.md` fila 6; `docs/diagramas/12-despliegue.mmd` |
| 3 | TTL (7 y 14 días), umbral de anomalía (40 %) y corroboración (5 %) son hipótesis provisionales y parametrizables; sin evidencia de comerciantes. | Punto de sensibilidad | EC-02, EC-03 | `docs/DECISIONS.md` (Pendientes); EC-02 y EC-03 en Notion |
| 4 | Modelo de lectura precalculado con `price_current` (CQRS ligero): rapidez de consulta a cambio de consistencia eventual de segundos y un outbox que operar. Gana el reporte con mayor `observedAt`. | Trade-off | EC-04, EC-02, EC-07 | ADR-004 y ADR-015 en `docs/DECISIONS.md` |
| 5 | Evitar bus externo: eventos con outbox en la misma base y repartidor en el mismo proceso; entrega al menos una vez y receptores idempotentes. | Trade-off | EC-05, RNF-009 | ADR-015 en `docs/DECISIONS.md`; alternativas descartadas en Notion §2 (microservicios, CQRS completo con broker) |
| 6 | Monolito modular: frente a microservicios, menor costo operativo; los límites de módulo deben verificarse para proteger EC-05. | Trade-off | EC-05 | ADR-001; Notion §2 «Alternativas descartadas» |
| 7 | Sesión con cookie de servidor y CSRF, mismo origen sin CORS hasta decidir el despliegue; no JWT sin nueva decisión. | Trade-off | EC-08 | ADR-014 en `docs/DECISIONS.md` (sección de la #16) |
| 8 | PWA con cola offline: la sincronización en segundo plano en iPhone no está probada; el envío podría ocurrir solo al abrir la app. | Riesgo | EC-07, EC-01 | Notion «Arquitectura y stack», §15 |
| 9 | REST frente a GraphQL: algunas vistas pueden requerir más de una solicitud; reabrir ADR-002 solo con evidencia. | Trade-off | EC-04 | ADR-002; Notion §8.1 |
| 10 | Cobertura real de SIPSA sin confirmar: si no cubre la canasta, la meta de arranque depende de la siembra manual. | Riesgo | RNF-014 | Notion §15; ADR-011 |
| 11 | Neutralidad: el orden solo usa precio, precio por unidad base, distancia y actualidad; promociones en bloque aparte. Cualquier criterio nuevo compromete EC-06. | Punto de sensibilidad | EC-06 | ADR-009 (Propuesto en Notion; ver `as-e1-arquitectura-v1.md`); `src/domain/neutral-ranking.ts` |
| 12 | Imágenes en carpeta del servidor en `dev`; el disco de Render es efímero y ADR-022 (Propuesto, en rama, sin integrar) propone Supabase Storage. | Riesgo | EC-08 | ADR-020 |
| 13 | Estados de ADR distintos entre Notion y repo (ADR-004) y ADR sin archivo en `docs/adr/`; el registro completo exigido en AS-E6 no está unificado. | Riesgo | Documento final | `as-e1-arquitectura-v1.md` filas 1 a 3 |
| 14 | Parámetros de sesión (expiración, rotación, revocación) pendientes de especificar según Notion; `openapi.yaml` declara 7 días sin uso o 30 desde el inicio. `PENDIENTE (equipo)`: aclarar cuál vale. | Punto de sensibilidad | EC-08 | EC-08 en Notion; `docs/openapi.yaml` (`securitySchemes`) |

AS-E1 en Notion (`41339c4a-833b-815b-80c1-cec59763ca1d`) contiene su propia sección «Riesgos y decisiones pendientes»; `PENDIENTE (equipo)`: cruzarla fila por fila con esta tabla, porque aquí no se reescribió AS-E1.

## 4. Escenarios por evaluar con evidencia nueva

Para cada EC, la evaluación ATAM de cierre debe enlazar su evidencia real. `PENDIENTE (equipo)`: reunir el informe de cada EC marcado en la sección 2 como pendiente, producido por los entregables de Modelos de Calidad y por AS-E5.

## 5. EC-05: esfuerzo estimado vs real

`PENDIENTE (equipo)`.

| Entrada necesaria | De dónde sale |
|---|---|
| Estimación previa de esfuerzo (horas por componente), registrada con fecha **antes** del primer commit de `commerce` y sin cambios después | AS-E4, sección 4 (en Notion las horas están en blanco a propósito; se llena el 23-nov tras la presentación del docente) |
| Lista de componentes del núcleo que se esperaba modificar | AS-E4, preanálisis de componentes afectados |
| Horas reales y lista real de componentes modificados | Registro de horas e issues, historial Git y las PR del módulo comercial (AS-E5) |
| Dependencias del núcleo hacia `commerce` y cambios en límites de módulo | Análisis estático de dependencias sobre el código integrado (AS-E5) |

Cálculo: desviación = (real − estimado) / estimado, referencia propuesta ≤ 30 % (RNF-005). Si se supera, se explica la diferencia; no se oculta (EC-05 en Notion). **No se calcula nada aquí.**

## 6. Decisiones que se cambiarían

`PENDIENTE (equipo)`. Entrada: la experiencia de integrar el módulo (AS-E5) y la comparación de AS-E4 frente a lo ocurrido. Candidatos ya señalados como abiertos en las fuentes, solo como punto de partida y sin que impliquen un cambio decidido: la elección de despliegue (ADR-012), los valores provisionales de TTL y umbrales, el diseño de lectura de confiabilidad (`as-e1-arquitectura-v1.md`, fila 10). El equipo debe justificar cada cambio con evidencia, y una corrección bien documentada se valora positivamente (Guía §10).

## 7. Documento de arquitectura final

`PENDIENTE (equipo)`. Depende de AS-E4 (arquitectura v2 y ADR nuevos o reemplazados) y de AS-E5 (lo realmente integrado y desplegado). Debe incluir:

- C4 actualizado (contexto y contenedores como mínimo; componentes de las partes críticas) a partir de `docs/diagramas/`.
- Registro completo de ADR con alternativas descartadas, un único estado vigente y archivo de ADR-012 (ver `as-e1-arquitectura-v1.md`, filas 1 a 3).
- Contrato `docs/openapi.yaml` sin la marca «preliminar».
- Reconciliación de las contradicciones abiertas de `as-e1-arquitectura-v1.md`.

## 8. Riesgos y decisiones pendientes de este entregable

| Pendiente | Depende de |
|---|---|
| Esfuerzo real del módulo comercial | AS-E5 |
| Estimación previa fechada | AS-E4 (23-nov) |
| Resultados de EC-01, EC-02, EC-04 y el escaneo de EC-08 | AS-E5, Modelos de Calidad |
| Decisión y registro de ADR-012 | Equipo y docente (RDA3) |
| Unificar la base de ADR de Notion con `docs/adr/` | Equipo |

## 9. Lista de verificación del entregable

- [x] Árbol de utilidad EC-01 a EC-08 con medidas de la base de escenarios.
- [x] Riesgos, puntos de sensibilidad y trade-offs ya documentados, con fuente.
- [ ] Evaluación por escenarios con evidencia real.
- [ ] Comparación de esfuerzo estimado y real (EC-05).
- [ ] Decisiones que se cambiarían y por qué.
- [ ] Arquitectura final y ADR completos.
- [ ] Revisión y aprobación del equipo.

## 10. Fuentes de referencia

- Guía: `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md` (§8 Fase 5, §9 Corte 3, §10).
- Notion: base de escenarios EC-01 a EC-08, base RNF, AS-E1 `41339c4a-833b-815b-80c1-cec59763ca1d`, AS-E4 `41339c4a-833b-8110-b2ca-e6b0dbe5ab2c`, AS-E6 `41339c4a-833b-81f4-a681-c8360adaddb8`, «Arquitectura y stack» `40d39c4a-833b-80ff-a47c-fb7c2d06254e`.
- Repo: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/adr/`, `docs/diagramas/`; mediciones de referencia en `docs/calidad/deteccion-anomalos.md`, `sincronizacion-ec07.md`, `matriz-autorizacion.md` y `privacidad-ec08.md`.
- Entregables hermanos: `as-e1-arquitectura-v1.md` y `as-e5-sistema-integrado.md` en esta carpeta.
