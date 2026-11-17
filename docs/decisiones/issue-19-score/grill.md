# Grill — issue #19: score de confiabilidad y reputación

- **Fuentes:**
  - Issue #19 (H2-02, épica #5): regla pura que calcula la confiabilidad de un precio con corroboraciones, reputación del reportante y antigüedad. Criterios: pesos y umbrales parametrizables y provisionales; un reporte corroborado sube y uno contradicho baja; la reputación no expone la identidad; ciclo TDD visible (PR-03).
  - RF-011 (Notion):
    - RN1: reputación neutra al inicio; sube con corroboraciones y baja cuando la moderación rechaza.
    - RN2: hay corroboración cuando al menos 2 cuentas distintas reportan precios dentro de ±5 % entre sí en la ventana de vigencia.
    - RN3: el score decae con el tiempo.
    - RN4: los reportes de una misma cuenta no se corroboran entre sí.
    - RN5: la reputación no se expone asociada a la identidad.
    - RN6: pesos y umbrales configurables.
    - Escenarios: 4000 y 4100 de dos cuentas dan más score que un reporte único; la misma cuenta no corrobora; un rechazo baja la reputación y los siguientes reportes pesan menos; un score de 0,8 sin reportes nuevos baja al pasar el 50 % de la ventana de vigencia.
  - ADR-005 (aceptado el 11 de noviembre): score con función pura, parametrizable y con TDD; se acepta el modelo, no los valores.
  - `docs/DECISIONS.md`: corroboración del 5 % provisional.
  - `docs/openapi.yaml`: `ComparisonItem.reliability` (`alta`, `media`, `baja`, `en_revision`) y `confirmations`, «desde la #31».
  - Código existente: `src/domain/freshness.ts` (TTL y estados) y `src/domain/neutral-ranking.ts`.
  - Issues relacionadas: #20 (anómalos), #31 (conectar las reglas a `price_current`), #32 y #33 (moderación).
- **Fecha:** 2026-11-12.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Qué se califica:** un reporte suelto o el precio vigente de una presentación en una tienda, con los reportes de su ventana.
2. **Corroboración y contradicción:** ±5 % respecto de qué; qué cuenta como contradicción; cuántas corroboraciones suman.
3. **Reputación:** su escala, el valor neutro, y si esta issue también la actualiza o solo la usa.
4. **Decaimiento:** cómo baja el score con la edad y en qué ventana.
5. **Combinación:** cómo se juntan reputación, corroboración, contradicción y edad en un número.
6. **Niveles:** cómo se pasa del número a `alta`, `media` y `baja`. `en_revision` lo decide la moderación.
7. **Parámetros:** dónde viven los pesos y umbrales provisionales.
8. **Privacidad:** cómo recibe la regla a los reportantes sin conocer su identidad.

## Preguntas

### 1. ¿Qué se califica?

- **Decisión:** el precio vigente de una presentación en una tienda. La regla recibe el precio candidato, los demás reportes de esa presentación y tienda en la ventana de vigencia, la reputación de cada reportante, la hora actual y el TTL, y devuelve un número.
- **Razón:** es lo que muestra la comparación (un resultado por tienda y presentación con su `reliability`) y lo que guardará la #31 en `price_current`. La corroboración de RF-011 es entre reportes: calificar cada reporte por separado terminaría en lo mismo con un paso más.

### 2. ¿Qué es corroborar y qué es contradecir?

- **Decisión:** siempre respecto del precio candidato. Otro reporte a ±5 % corrobora; más lejos, contradice. Solo cuentan reportes de la ventana de vigencia (edad ≤ TTL de la categoría) y del mismo tipo de precio (`normal` con `normal`, `oferta` con `oferta`). Cada cuenta cuenta una vez, con su reporte más reciente, y la cuenta del candidato no cuenta (RN4). El resultado son dos números: `corroborations` y `contradictions`. El ±5 % es un parámetro provisional.
- **Razón:** con un precio de referencia fijo el resultado es simple de explicar («3 personas confirmaron este precio»). Una oferta legítima no debe desmentir el precio normal. Medir contra la mediana de la ventana se parece a la regla de anómalos de la #20: cada regla hace una sola cosa.

### 3. ¿Cómo es la reputación?

- **Decisión:** escala de 0 a 1, con 0,5 neutro para toda cuenta nueva. La #19 incluye la regla pura `updateReputation(current, event)` con `corroborated` (+0,05) y `rejected` (−0,20), siempre entre 0 y 1; los dos pasos son provisionales. Guardarla y llamarla le toca a la #31 (corroboración) y a la #32 o #33 (moderación).
- **Razón:** ganar confianza debe costar más que perderla: un rechazo borra cuatro corroboraciones, y nadie puede acumular reputación con reportes fáciles para gastarla en un precio falso. RF-011 describe las dos reglas juntas y la #19 lleva «reputación» en el título.

### 4. ¿Cómo decae el score con el tiempo?

- **Decisión:** en línea recta: `factorEdad = 1 − edad / (2 × TTL)`, nunca menor que 0. La edad se cuenta desde el reporte más reciente entre el candidato y los que lo corroboran; una edad negativa (margen de relojes de la #14) cuenta como 0.
- **Razón:** coincide con los estados de `freshness.ts`: 0,5 al pasar a «por confirmar» (TTL) y 0 al quedar «desactualizado» (2 TTL). Cumple el escenario de RF-011 (0,8 pasa a 0,6 a la mitad del TTL). Una corroboración reciente renueva el precio porque alguien lo acaba de ver. El exponencial nunca llega a 0 y es más difícil de explicar.

### 5. ¿Cómo se combinan los factores?

- **Decisión:**

  ```
  score = factorEdad × limitar(0,5 × reputación del candidato
                             + 0,5 × min(C, 3) / 3
                             − 0,5 × min(D, 3) / 3, entre 0 y 1)
  ```

  `C` y `D` suman corroboraciones y contradicciones, cada una con peso `2 × reputación` de su cuenta (una cuenta neutra pesa 1). Los tres pesos de 0,5 y el tope de 3 son provisionales y viven en un objeto de parámetros.
- **Razón:** cumple los escenarios de RF-011 (un reporte solo 0,25; confirmado por otra cuenta 0,42; por tres, 0,75; contradicho, 0,08). Se explica en una frase. El tope evita que muchas cuentas coordinadas empujen el score sin límite, y el peso por reputación hace que los reportes de una cuenta con rechazos pesen menos también al corroborar. Un modelo estadístico sería más difícil de explicar y de calibrar sin datos (ADR-005 descartó el aprendizaje automático por lo mismo).

### 6. ¿Cómo se pasa del número a un nivel?

- **Decisión:** `reliabilityLevel(score)`: `alta` desde 0,6, `media` desde 0,25 y `baja` por debajo, con umbrales provisionales en el mismo objeto de parámetros. `en_revision` no sale del score: lo decide la moderación (#32).
- **Razón:** al principio casi todo precio tendrá un solo reporte; si cayera en `baja`, el usuario dejaría de creerle a la app sin motivo. `alta` exige confirmación de otras cuentas o buena reputación, y un precio contradicho baja enseguida a `baja`. Los tercios (0,33 y 0,67) mandarían a `baja` el caso más común.

### 7. ¿Dónde viven los parámetros?

- **Decisión:** en `RELIABILITY_PARAMS`, un objeto del dominio con todos los pesos, umbrales y pasos, marcado como provisional. Las funciones lo reciben como parámetro opcional (`params = RELIABILITY_PARAMS`).
- **Razón:** un solo lugar (RN6), las pruebas y la calibración de ADR-005 pueden pasar otros valores, y un cambio definitivo queda como commit con su motivo. Es el patrón de los TTL y de los límites de la sesión. Las variables de entorno no hacen falta hoy (YAGNI), el dominio no lee la configuración y cada máquina podría calificar distinto sin rastro.

### 8. ¿Cómo recibe la regla a los reportantes sin conocerlos?

- **Decisión:** cada reporte llega como `ScoredReport` con `reporterKey` (una clave opaca), `priceCop`, `priceType` y `observedAt`. La reputación llega como `reputationOf(key)`. La salida es `{ score, level, corroborations, contradictions }`, sin ninguna clave. La #31 decide qué clave pasa (el id de la cuenta o un hash). Una prueba verifica que la salida no contiene las claves de entrada.
- **Razón:** la regla solo necesita saber si dos reportes son de la misma cuenta (RN4) y cuánta reputación tiene cada una. Recibir la cuenta completa no aporta al cálculo y abre la puerta a devolverla por error (RN5, EC-08). `corroborations` es lo que el contrato llama `confirmations`.

## Resultado

Ocho decisiones. El plan de ciclos TDD está en `plan.md`. No cambia la API: `reliability` y `confirmations` se conectan en la #31.
