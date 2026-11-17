# Grill — issue #20: detección de precios anómalos frente a la mediana

- **Fuentes:**
  - Issue #20 (H2-02, épica #5): regla pura que marca un reporte como sospechoso si se desvía de la mediana reciente de esa presentación en ese establecimiento o zona. Criterios: umbral parametrizable (40 % provisional); con pocos datos no marca y lo deja registrado; un sospechoso no se borra; ciclo TDD visible (PR-04).
  - RF-012 (Notion):
    - RN1, rango: un precio que se aparta más de X % de la mediana de precios vigentes de la misma presentación en la zona queda «en revisión» (X = 40 %, provisional).
    - RN2, ráfaga: más de N reportes por hora desde una cuenta genera un bloqueo temporal.
    - RN3, coordinación: varias cuentas recientes que reportan el mismo precio atípico en una tienda en una ventana corta quedan «en revisión».
    - RN4: la detección no borra datos; cambia su estado y avisa a moderación.
    - RN5: detección de 80 % o más sobre un conjunto etiquetado; los falsos positivos se registran.
    - Escenarios: mediana 5000 y reporte de 2500 queda en revisión; ráfaga; 4 cuentas nuevas que reportan 1500 para un producto de 5000 en 10 minutos quedan en revisión.
  - `docs/DECISIONS.md` y `docs/PLAN_MAESTRO.md`: 40 % provisional y parametrizable; 80 % de detección aprobado (EC-03).
  - Código existente: `src/domain/reliability.ts` (#19, mismo estilo de parámetros y claves opacas) y `src/domain/freshness.ts`.
  - Issues relacionadas: #29 (límites de aportes por usuario), #31 (aplicar las reglas a `price_current` y medir el 80 %), #32 (cola de moderación).
- **Fecha:** 2026-11-14.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **Alcance:** la #20 habla de la mediana (RN1), pero RF-012 también tiene ráfagas (RN2) y coordinación (RN3).
2. **Mediana de qué:** la tienda o la zona, quién arma el conjunto de referencia y qué reportes entran (vigentes, mismo tipo de precio, otras cuentas).
3. **Desviación:** hacia arriba y hacia abajo, y cómo se mide.
4. **Pocos datos:** cuántos precios hacen falta para confiar en la mediana, y qué devuelve la regla cuando no alcanzan.
5. **Salida:** qué devuelve la regla para que la #31 lo guarde y la #32 lo muestre.
6. **No borrar:** cómo se garantiza RN4 si la regla es pura.
7. **Parámetros y privacidad:** dónde vive el 40 % y cómo llegan los reportantes.

## Preguntas

### 1. ¿Qué cubre la #20?

- **Decisión:** el rango frente a la mediana (RN1) y la coordinación (RN3). La ráfaga (RN2) va a la #29, que ya pide un límite de aportes por usuario.
- **Razón:** rango y coordinación son reglas puras sobre precios y usan la misma mediana. La coordinación es el ataque del escenario de EC-03: con varias cuentas falsas, la mediana misma se mueve hacia el precio falso y el rango solo no lo detecta. La ráfaga es un límite de frecuencia sobre la ruta, como los del inicio de sesión.
- **Consecuencia:** se deja un comentario en la #29 para que incluya RN2 de RF-012.

### 2. ¿Contra qué precios se calcula la mediana?

- **Decisión:** la regla recibe una lista de precios de referencia y no decide si son de la tienda o de la zona: eso lo arma la #31 (la zona necesita PostGIS). De la lista solo entran reportes de la ventana de vigencia (edad ≤ TTL), del mismo tipo de precio, de cuentas distintas a la del reporte evaluado y uno por cuenta, el más reciente. Son los mismos filtros del score (#19), y se comparten en una función común del dominio.
- **Razón:** el dominio no toca la base. Una cuenta no sirve de referencia para sí misma ni puede mover la mediana repitiendo reportes, y una oferta legítima no debe parecer anómala frente a precios normales.
- **Para la #31:** no pasar como referencia precios que ya están en revisión, para que un ataque anterior no contamine la mediana.

### 3. ¿Cómo se mide la desviación?

- **Decisión:** `desviación = |precio − mediana| / mediana`; es sospechoso si la desviación es **mayor** que 40 % (parámetro provisional), hacia arriba o hacia abajo. Con mediana de 5000: 2500 y 7500 son sospechosos; 3000 (40 % justo) no.
- **Razón:** los ataques van en las dos direcciones: precios bajos falsos para atraer clientes y precios altos falsos para espantarlos de la tienda vecina. RF-012 habla de «fuera de rango», sin dirección, y dice «más de X %».

### 4. ¿Qué pasa con pocos datos?

- **Decisión:** hacen falta al menos 3 cuentas de referencia después de los filtros (provisional). Con menos, la regla no marca y devuelve `sin_datos` con el número de referencias, para que la #31 lo guarde. Con un número par, la mediana es el promedio de los dos del medio.
- **Razón:** con 1 o 2 referencias, un solo reporte falso haría ver como anómalo un precio verdadero; con 3 ya hay un precio del medio que un reporte extraño no mueve. Guardar `sin_datos` permite contar cuántos reportes no se pudieron evaluar y calibrar el 40 % y el mínimo (ADR-005). Exigir 5 dejaría la detección casi sin uso al principio.

### 5. ¿Cómo se detecta un grupo coordinado (RN3)?

- **Decisión:** la regla evalúa un reporte a la vez. Forman grupo con él los reportes de la misma tienda, a ±5 % de su precio, vistos dentro de 60 minutos alrededor del suyo y de cuentas creadas hace menos de 7 días. Hay coordinación si el grupo junta 3 cuentas nuevas o más (contando la del reporte) **y** su precio se aparta más del 40 % de la mediana calculada sin esas cuentas. Entonces el reporte queda `sospechoso` con motivo `coordinacion`. La regla pide `accountCreatedAt(clave)` con la clave opaca. Todos los números son provisionales.
- **Razón:** si el grupo entra en la referencia, mueve la mediana hacia el precio falso y el rango no ve nada. Varias cuentas nuevas de acuerdo con el precio real no son sospechosas: hace falta también que el precio sea raro. Como la #31 evalúa cada reporte del grupo, todos quedan en revisión, como pide el escenario de RF-012.

### 6. ¿Qué devuelve la regla y cómo se cumple «no borrar»?

- **Decisión:** `assessAnomaly` devuelve uno de tres resultados: `{ status: 'normal', median, deviation, references }`, `{ status: 'sospechoso', reason: 'rango' | 'coordinacion', median, deviation, references }` o `{ status: 'sin_datos', references }`. Si se cumplen rango y coordinación, gana `coordinacion`. La #31 traduce `sospechoso` a «en revisión» y lo manda a la cola de la #32. RN4: la regla no modifica lo que recibe (prueba de caracterización); los reportes son de solo inserción desde la #14 y la #31 solo cambia su estado, nunca los borra (queda escrito en `DECISIONS.md`).
- **Razón:** la mediana y la desviación explican la marca a la moderación; el motivo distingue un precio raro de un ataque en grupo; `references` permite revisar y contar los `sin_datos` para calibrar. Un «sí o no» no daría nada de eso.

### 7. ¿Dónde viven los parámetros y cómo se protege al reportante?

- **Decisión:** `ANOMALY_PARAMS` en el dominio (`maxDeviation` 0,4; `minReferences` 3; `coordination` con `minAccounts` 3, `windowMinutes` 60, `newAccountDays` 7 y `priceTolerance` 0,05), todos provisionales y reemplazables al llamar. El reportante llega como clave opaca, la edad de su cuenta con `accountCreatedAt(clave)`, y la salida no lleva claves. Los filtros comunes con el score pasan a `src/domain/report-window.ts` en un `refactor(domain)` antes del primer ciclo.
- **Razón:** el mismo patrón de la #19 (RN6, ADR-005, EC-08). Sacar el filtro antes del primer ciclo deja que las pruebas del score demuestren que no cambió nada, y evita dos copias de la misma regla que se pueden separar sin que nadie lo note.

## Resultado

Siete decisiones. El plan de ciclos TDD está en `plan.md`. No cambia la API: guardar el estado y mandarlo a moderación le toca a la #31 y la #32.
