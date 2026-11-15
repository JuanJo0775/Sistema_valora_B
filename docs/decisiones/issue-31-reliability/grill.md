# Grill — issue #31: aplicar vigencia, confiabilidad y anómalos a `price_current`

- **Fuentes:**
  - Issue #31 (Corte 2, épica #5): `reliability` escucha `PriceReported` y actualiza el estado en `price_current`. Criterios: un precio sospechoso no aparece como vigente sin advertencia; conjunto etiquetado de 100 reportes con 30 anómalos, detección de 80 % o más y falsos positivos registrados (PR-11); `reliability` no consulta las tablas de `pricing`.
  - RF-010, RF-011 y RF-012; EC-03; ADR-004 (CQRS ligero), ADR-005 y ADR-015 (outbox).
  - Reglas ya construidas: `reliabilityScore`, `reliabilityLevel` y `updateReputation` (#19); `assessAnomaly` (#20); `comparableReports` (`report-window.ts`).
  - Grill de la #19: `reliability` y `confirmations` llegan a la comparación con esta issue; guardar la reputación le toca a esta issue (corroboración) y a la #32 o #33 (rechazos).
  - Grill de la #20: la #31 arma las referencias (tienda o zona), no pasa como referencia precios ya en revisión y nunca borra reportes.
  - Grill de la #14: el evento `PriceReported` v1 **no** lleva datos del reportante (EC-08).
  - Código existente: `comparison` guarda `price_current` al recibir `PriceReported` (gana el más reciente); `docs/openapi.yaml` marca `reliability` y `confirmations` «desde la #31».
  - Arquitectura (`.claude/rules/arquitectura-monolito-modular.md`): `reliability` es núcleo; los módulos se comunican por `index.ts` o por eventos (`ScoreActualizado` previsto).
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Alcance:** módulo nuevo, eventos, comparación, reputación y el conjunto etiquetado son mucho para un solo pull request.
2. **La clave del reportante:** las reglas necesitan saber qué reportes son de la misma cuenta y su reputación, pero `PriceReported` v1 no lleva al reportante.
3. **Qué guarda `reliability`:** sus propias tablas (reportes vistos, reputación, estado por precio) sin leer `pricing`.
4. **Cómo llega el resultado a la comparación:** `comparison` no puede leer las tablas de `reliability`.
5. **Qué pasa con un precio sospechoso:** no reemplaza el vigente, se muestra con advertencia o ambas.
6. **Edad del score:** el score decae con el tiempo; se calcula al leer o se guarda.
7. **Referencias por zona:** la mediana de la zona necesita tiendas cercanas (PostGIS) y la edad de las cuentas (identity).
8. **Reputación:** cuándo se aplica `corroborated`.
9. **Conjunto etiquetado (PR-11):** cómo se arma, dónde vive y cómo se mide el 80 %.

## Preguntas

### 1. ¿Uno o dos pull requests?

- **Decisión:** dos, en orden.
  1. **El flujo completo:** el módulo `reliability` recibe cada reporte, guarda lo que necesita en su propio esquema, aplica `assessAnomaly` y `reliabilityScore`, actualiza la reputación y publica el resultado; `comparison` lo guarda en `price_current` y lo muestra en la API con `reliability`, `confirmations` y la advertencia de los sospechosos. Cumple los criterios 1 y 3.
  2. **El conjunto etiquetado (PR-11):** 100 reportes con 30 anómalos pasan por el flujo real; se mide la detección (80 % o más) y se registran los falsos positivos, con un informe de calibración. Cumple el criterio 2.
- **Razón:** la primera parte ya toca dos módulos, un evento y el contrato. Con el flujo funcionando, la segunda mide el comportamiento real, y si no llega al 80 % se calibra en su propio pull request, sin mezclar construir con calibrar.
- **Consecuencia:** se abre una issue nueva para la segunda parte; la #31 se cierra con el segundo pull request. Este grill decide las dos.

### 2. ¿Cómo sabe `reliability` quién reportó sin conocer la cuenta?

- **Decisión:** `PriceReported` versión 2 agrega `reporterKey` = `HMAC-SHA256(REPORTER_KEY_SECRET, id de la cuenta)` y `reporterSince` (fecha de creación de la cuenta, solo el día). `identity` calcula la clave con una función pública y `pricing` la pide al registrar, porque ya tiene la sesión. `REPORTER_KEY_SECRET` es una variable de entorno nueva, validada al arrancar. `reliability` guarda solo la clave y la reputación se asocia a ella.
- **Razón:** la clave es estable por cuenta y no se convierte en el id sin el secreto, así el id del reportante no se reparte por el outbox ni por otro módulo (EC-08, decisión de la #14). Un secreto propio evita que rotar `SESSION_SECRET` borre las reputaciones. ADR-015 pide una versión nueva cuando cambia la forma de un evento. Llevar el id real, o preguntarle a `pricing`, repartiría la identidad y acoplaría dos módulos del núcleo.
- **Consecuencia:** la prueba de las llaves del evento se actualiza: sigue sin correo, sin id de cuenta y sin ubicación.

### 3. ¿Qué guarda `reliability`?

- **Decisión:** dos tablas en el esquema `reliability`:
  - `observations`: una fila por `PriceReported` recibido (`report_id`, `presentation_id`, `establishment_id`, `reporter_key`, `reporter_since`, `price_cop`, `price_type`, `observed_at`, `received_at`) y el resultado de `assessAnomaly` al llegar (estado, motivo, mediana, desviación y referencias). Solo inserción: la moderación (#32) cambiará su estado, nunca la borrará.
  - `reputations`: `reporter_key`, `value` (0 a 1) y `updated_at`. Sin fila, la reputación es la neutra (0,5).
  - No guarda el score (cambia con el tiempo, pregunta 6) ni nada que identifique a la persona.
- **Razón:** con su propia copia (CQRS, ADR-004) tiene todo lo que piden las reglas sin pedirle nada a `pricing` (criterio 3). Guardar cada evaluación deja rastro para revisar por qué se marcó un precio y contar los `sin_datos` al calibrar.

### 4. ¿Cómo llega el resultado a la comparación?

- **Decisión:** con una cadena de eventos: `pricing` publica `PriceReported` v2; `reliability` lo evalúa, lo guarda y publica `PriceAssessed` v1 (el `ScoreActualizado` de la arquitectura, en inglés) con los datos del precio y el veredicto (`normal`, `sospechoso` con motivo, o `sin_datos`), sin la clave del reportante; `comparison` deja de escuchar `PriceReported` y actualiza `price_current` al recibir `PriceAssessed`.
- **Razón:** `comparison` decide con el veredicto en la mano; si los dos escucharan `PriceReported`, la comparación podría mostrar un sospechoso antes de que `reliability` lo revise. Es el flujo `pricing → reliability → comparison` de Notion para el Corte 2. Cuesta un paso más del outbox (segundos), ya aceptado en ADR-004.

### 5. ¿Qué pasa con un precio sospechoso?

- **Decisión:**
  - Si ya hay un precio vigente en esa tienda, el sospechoso **no lo reemplaza**.
  - Si no hay ninguno, se guarda marcado `en_revision`; la comparación lo muestra al final, con los desactualizados, con `reliability: en_revision` y nunca como `isCheapest`.
  - `normal` y `sin_datos` siguen la regla de hoy: gana el observado más reciente.
  - La moderación (#32) podrá aprobarlo (pasa a competir) o descartarlo.
- **Razón:** un ataque no borra un precio verdadero (escenario de RF-012: 4 cuentas nuevas con 1500 donde el precio es 5000), y no se esconde información sin avisar. `sin_datos` no es sospechoso: si lo fuera, ningún precio de una tienda nueva aparecería. Ocultar siempre a los sospechosos haría desaparecer sin aviso los falsos positivos.

### 6. ¿El score se calcula al leer o se guarda?

- **Decisión:** al leer. `reliability` expone la consulta pública `ReliabilityOfPrices`: la comparación le pasa los precios que va a mostrar (presentación, tienda, reporte vigente) y el TTL de la categoría; `reliability` lee sus `observations` y `reputations`, aplica `reliabilityScore` y `reliabilityLevel` con la hora actual y devuelve el nivel y `confirmations` de cada uno. Una consulta por comparación. Lo que sí se guarda es el veredicto de anómalos de cada reporte (no cambia con el tiempo).
- **Razón:** el score decae con el tiempo y cambia con nuevas confirmaciones y con la reputación; calculado al leer siempre está al día, sin tareas programadas, igual que la vigencia (#15). Guardarlo dejaría un `alta` viejo hasta que algo lo recalcule. Si la prueba de carga (#35) muestra lentitud, se reconsidera con datos.

### 7. ¿Contra qué precios se compara un reporte nuevo?

- **Decisión:** primero la misma tienda (las `observations` de esa presentación en ese establecimiento); si no hay 3 cuentas, la zona: las tiendas a 1 km o menos (provisional), que `establishments` entrega con una consulta pública nueva, `EstablishmentsAround({ establishmentId, radiusMeters })`. La coordinación se mira siempre en la misma tienda (RF-012). No entran como referencia los reportes ya marcados `sospechoso`. La edad de la cuenta sale de `reporterSince`.
- **Ajuste durante la construcción (14 de noviembre):** excluir los sospechosos de la tienda rompe la detección de grupos: las primeras cuentas de un grupo ya quedan sospechosas por rango, y si se excluyen, la tercera nunca forma grupo. Por eso, en la misma tienda los sospechosos sí cuentan (la regla de la #20 ya saca al grupo de la mediana); en la zona sí se excluyen. Queda para medir con el conjunto etiquetado de la #67. **Medido en la #67:** contar los sospechosos de la tienda en la mediana dejaba que un ataque anterior la moviera y produjera un falso positivo; desde entonces cuentan solo para formar un grupo (`flagged`), nunca para la mediana.
- **Razón:** al principio pocas tiendas tendrán 3 cuentas para un producto en 14 días; con solo la tienda, casi todo sería `sin_datos` y la #31b no llegaría al 80 %. La tienda, cuando tiene datos, es la referencia más fiel, y en 1 km los precios suelen parecerse. Excluir los sospechosos evita que un ataque anterior contamine la mediana (grill de la #20).

### 8. ¿Cuándo sube la reputación?

- **Decisión:** cuando llega un reporte no sospechoso, `reliability` busca en la misma tienda reportes de otras cuentas que coinciden con él (mismo tipo, ±5 %, dentro de la ventana). Si hay al menos uno, ganan `corroborated` el autor del reporte nuevo y el de cada reporte que coincidió. Cada reporte sube la reputación de su autor como mucho una vez; la tabla `reliability.reputation_events` (una fila por reporte que ya dio su punto) lo garantiza y sirve de bitácora. Un sospechoso no da ni recibe reputación. Los rechazos de moderación llegan con la #32.
- **Razón:** cumple RN1 de RF-011 sin que un solo reporte popular acumule reputación sin límite, y sin que un grupo coordinado se infle entre sus cuentas.

### 9. ¿Cómo se arma y se mide el conjunto etiquetado (segundo pull request, PR-11)?

- **Decisión:** `test/fixtures/reliability/labeled-reports.csv` con 100 reportes en orden de llegada y su etiqueta (`anomalo`, `tipo`). Los 30 anómalos: precios aislados muy bajos o muy altos, grupos coordinados de cuentas nuevas y casos difíciles (grupo espaciado más de 60 minutos, tiendas sin vecinos). Los 70 honestos: variación normal entre tiendas (5 % a 20 %), ofertas y cuentas nuevas honestas. Es sintético y lo explica un `README.md` junto al archivo. Una prueba de integración pasa los 100 por el caso de uso real de `reliability` contra `valora_test` (sin HTTP); solo `sospechoso` cuenta como detectado; la prueba falla si la detección baja del 80 %. `pnpm reliability:evaluate` imprime detectados por tipo, falsos positivos y `sin_datos`, y esa tabla va a `docs/calidad/deteccion-anomalos.md` (evidencia para MC-E3 y EC-03). Si no se llega al 80 %, se calibran los parámetros en ese pull request y se documenta cada cambio (ADR-005).
- **Razón:** no hay datos reales todavía (la semilla no tiene precios) y sin etiquetas no se puede medir. Sintético y documentado, el profesor y el equipo pueden revisarlo y ampliarlo. La CI protege el 80 % de aquí en adelante.

## Resultado

Nueve decisiones. El contrato está en `contrato-api.md` y el plan en `plan.md`.
