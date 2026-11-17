# Grill — issue #13: catalog y establishments con datos semilla

Grill común de la issue padre #13. Cada parte (#49 catálogo, #50 establecimientos y #51 semilla) tendrá su propio contrato y plan.

- **Fuentes:**
  - Issue #13.
  - RF-003 (catálogo), RF-004 (presentaciones), RF-005 (establecimientos) y RF-014 (carga inicial).
  - ADR-003, ADR-007 (propuesto), ADR-011, ADR-019 (propuesto) y ADR-020 (propuesto).
  - `docs/openapi.yaml`: `GET /products`, `GET /products/{productId}`, `GET /establishments/nearby` y los esquemas `Product`, `Presentation` y `Establishment`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Contradicciones encontradas

1. **Coordenadas.** La #13 pide «establecimientos con coordenadas» y RF-005 pide «Cómo llegar» a las coordenadas de la tienda, pero el esquema `Establishment` del contrato no tiene latitud ni longitud.
2. **Quién calcula la cercanía.** RF-005 («Mapa con radio ajustable») dice que la ubicación del usuario «no se envía al servidor», pero el contrato tiene `GET /establishments/nearby?lat&lng`, que sí la envía.

## Huecos

3. ADR-007 sigue «Propuesto» y la #13 construye ese catálogo.
4. No existen todavía datos propios de tiendas («fuente local» de H1-03 pendiente); los datos semilla no se inventan.
5. Falta decidir si la búsqueda de `GET /products` entra en esta issue.

## Preguntas

### 1. Partir la issue

- **Opciones:**
  - (a) Tres issues hijas: catálogo, establecimientos y semilla.
  - (b) Una sola issue.
- **Recomendación:** (a).
  - PR pequeños, cada uno con su ciclo TDD.
  - Catálogo y establecimientos son independientes.
  - La semilla depende de ambos y de la decisión sobre los datos.
- **Decisión:** (a). Issues #49 (catalog), #50 (establishments) y #51 (semilla), como sub-issues de #13.

### 2. ADR-007 (catálogo canónico)

- **Opciones:**
  - (a) Aceptarlo antes de construir el catálogo.
  - (b) Construir sobre el ADR propuesto.
- **Recomendación:** (a).
  - El código quedaría sin respaldo formal.
  - La #11 ya se apoyó en él.
  - Sus alternativas (texto libre o solo un catálogo externo) van contra RF-003 y RF-004.
- **Decisión:** (a). ADR-007 pasó a Aceptado en Notion el 11-nov-2026, sin cambiar su contenido (solo el prefijo «ACEPTADA»). Queda registrado en la Auditoría.

### 3. ¿Se envía la ubicación del usuario al servidor?

- **Contradicción dentro de Notion:**
  - RF-005 RN5 permite usar la ubicación para calcular cercanía sin almacenarla.
  - El escenario «Mapa con radio ajustable» dice que no se envía al servidor.
  - ADR-019 dice en la misma frase que el mapa usa `GET /establishments/nearby` y que la ubicación no se envía.
  - El contrato usa `lat` y `lng` en `nearby` y en la comparación.
- **Opciones:**
  - (a) Enviarla solo para calcular la cercanía: nunca se guarda en la base ni en los logs, ni aparece en respuestas, y una prueba lo verifica.
  - (b) Nunca enviarla: el servidor entrega todas las tiendas y el dispositivo filtra; hay que cambiar `nearby` y la comparación.
- **Recomendación:** (a).
  - Cumple RN5 y EC-08: no se guarda ni se expone.
  - La comparación (paso 6) ya necesita la ubicación en el servidor para el radio, el orden por distancia y el más barato cercano.
  - ADR-019 ya se apoya en `nearby`.
- **Decisión:** (a).
  - Se corrige la redacción del escenario de RF-005 y de ADR-019 en Notion, mostrada antes de aplicarla.
  - El esquema `Establishment` incluirá las coordenadas de la tienda, que son públicas (resuelve la contradicción 1).
  - **Aplicado en Notion el 11-nov-2026:**
    - En el escenario «Mapa con radio ajustable» de RF-005, «no se envía al servidor» pasó a «se envía solo para calcular la cercanía, sin guardarse ni aparecer en ninguna respuesta (RN5)».
    - La frase equivalente de ADR-019 (sigue Propuesto) se ajustó igual.
    - El cambio quedó registrado en la Auditoría.

### 4. De dónde salen los datos semilla

- **Opciones:**
  - (a) Establecimientos de Armenia tomados de OpenStreetMap, citando la fuente (ODbL), y una lista corta de productos de la canasta básica elegida por el equipo. Cada fila guarda fuente, fecha y responsable.
  - (b) Datos de demostración ficticios, marcados como tales.
- **Recomendación:** (a).
  - Son datos verificables, como piden RF-014 RN5 y la regla de Notion de no inventar datos.
  - Las tiendas que no estén en OpenStreetMap llegan después por sugerencia de la comunidad (RF-005, ADR-019).
  - #49 y #50 no necesitan la semilla; solo #51 espera la lista del equipo.
- **Decisión:** (a).
  - El equipo entrega la lista de productos (nombre, marca y presentaciones) en un formato que se prepara para llenarlo.
  - La descarga de OpenStreetMap se hace al construir #51, con permiso previo.

### 5. ¿La búsqueda de productos entra en #49?

- **Opciones:**
  - (a) Issue aparte para `GET /products?q&barcode`.
  - (b) Incluirla en #49.
- **Recomendación:** (a).
  - La búsqueda sin tildes trae su propia decisión técnica (`unaccent`, `pg_trgm`, ADR-003).
  - #49 queda enfocada en crear el primer módulo.
  - La pantalla de registrar precio (paso 8) la necesita, así que entra al H2-01 antes de ese paso.
- **Decisión:** (a). Issue #52, sub-issue de la épica #2. #49 entrega solo `GET /products/{productId}`.

## Resumen del grill común

| Tema | Decisión |
|---|---|
| Partición | #49 catálogo, #50 establecimientos, #51 semilla y #52 búsqueda |
| ADR-007 | Aceptado el 11-nov-2026 |
| Ubicación del usuario | Se envía solo para calcular cercanía; no se guarda, no se registra, no se expone |
| Coordenadas de la tienda | Se incluyen en el esquema `Establishment` |
| Datos semilla | Tiendas de OpenStreetMap (ODbL, citadas) y productos elegidos por el equipo |
