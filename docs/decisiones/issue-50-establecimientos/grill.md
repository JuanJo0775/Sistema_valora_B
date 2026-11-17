# Grill — issue #50: establishments, directorio con ubicación

- **Fuentes:**
  - Issue #50 (parte 2 de #13).
  - Grill común en `docs/decisiones/issue-13-catalogo-y-establecimientos/grill.md`.
  - RF-005 (con el escenario «Mapa con radio ajustable» corregido el 11-nov-2026).
  - ADR-003, ADR-019 (propuesto) y ADR-021.
  - EC-04 y EC-08.
  - `docs/openapi.yaml`: `GET /establishments/nearby` y el esquema `Establishment`.
- **Fecha:** 2026-11-11.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Ya decidido en el grill común

- La ubicación del usuario se envía solo para calcular la cercanía: no se guarda, no se registra en los logs y no aparece en ninguna respuesta.
- La respuesta incluye las coordenadas de la tienda (son públicas; las necesitan el mapa y «Cómo llegar»).

## Huecos encontrados

1. **Tipos de establecimiento.** El contrato tiene `barrio`, `minimercado` y `supermercado`; ADR-019 colorea el mapa con un cuarto tipo, «descuento».
2. **Dirección.** La descripción de RF-005 dice «nombre, tipo, dirección y coordenadas», pero `Establishment` no tiene dirección.
3. **Radio.** El contrato pone 2 km por defecto, sin mínimo ni máximo; ADR-019 dice que el usuario lo ajusta entre 0,5 y 3 km.
4. **Límites de la consulta.** No hay validación de rango para `lat` y `lng`, ni un máximo de resultados.
5. **`hasVerifiedProfile`.** Depende del perfil de comercio (RF-015, corte 3), y el núcleo no puede depender de `commerce`.
6. **Moderación.** RF-005 RN7: una tienda sugerida no aparece hasta que la aprueba un moderador. Las sugerencias no son de esta issue.

## Preguntas

### 1. Tipos de establecimiento

- **Contradicción:** el contrato y RF-005 tienen `barrio`, `minimercado` y `supermercado`; ADR-019 colorea un cuarto tipo, «descuento».
- **Opciones:**
  - (a) Cuatro tipos, agregando las tiendas de descuento.
  - (b) Solo los tres; las de descuento cuentan como supermercado y se corrige ADR-019.
- **Recomendación:** (a).
  - Para quien compara precios, una tienda de descuento (marcas propias, poca variedad, precios bajos) es otra categoría.
  - Ya está en el prototipo validado (MC-E4, ADR-019).
- **Decisión:** (a).
  - El cuarto valor es `descuento`, en español como los otros tres. Los valores del contrato están en español y cambiarlos rompería al frontend; se mantienen por coherencia.
  - **Pendiente de mostrar antes de aplicar:** el ajuste de la descripción de RF-005 en Notion para nombrar las tiendas de descuento.

### 2. Dirección

- **Hueco:** RF-005 guarda «nombre, tipo, dirección y coordenadas», pero `Establishment` no tiene dirección.
- **Opciones:**
  - (a) `address` opcional, como texto.
  - (b) Obligatoria.
- **Recomendación:** (a).
  - Muchas tiendas de OpenStreetMap (semilla, #51) no tienen calle ni número, y algunas tiendas de barrio se ubican de forma informal; obligarla llevaría a inventarla.
  - Las coordenadas sí son obligatorias y son lo que usan el mapa, la cercanía y «Cómo llegar».
- **Decisión:** (a). `Establishment` agrega `address` opcional.

### 3. Radio de búsqueda

- **Hueco:** el contrato pone `radiusKm` en 2 por defecto, sin límites; ADR-019 y RF-005 usan entre 0,5 y 3 km.
- **Opciones:**
  - (a) De 0,5 a 3 km, con 2 por defecto; fuera de rango responde 400 `VALIDATION_ERROR`.
  - (b) Sin máximo.
- **Recomendación:** (a).
  - Rendimiento (EC-04): sin máximo, una consulta podría devolver todo el directorio.
  - Coincide con el prototipo validado (ADR-019); Armenia es una ciudad compacta.
- **Decisión:** (a). Valores iniciales calibrables. El contrato agrega `minimum: 0.5` y `maximum: 3`.

### 4. Límites de la consulta

- **Opciones:**
  - (a) `lat` entre −90 y 90 y `lng` entre −180 y 180 (si faltan o están fuera de rango, 400 `VALIDATION_ERROR`), y el parámetro común `limit` (20 por defecto, 50 como máximo), las más cercanas primero.
  - (b) Sin límite de resultados.
- **Recomendación:** (a).
  - Coordenadas inválidas son datos inválidos, no un error de la base.
  - Rendimiento y pantalla (EC-04): solo hacen falta las más cercanas, y `limit` ya existe en el contrato.
- **Decisión:** (a). Una ubicación fuera del Quindío no es un error: responde la lista vacía. RF-005 RN1 aplica a las tiendas sugeridas, no a quien consulta.

### 5. `hasVerifiedProfile`

- **Contexto:** depende del perfil de comercio (RF-015), que maneja `commerce` en el corte 3; el núcleo no puede depender de `commerce`.
- **Opciones:**
  - (a) Quitarlo del contrato hasta que exista el módulo comercial.
  - (b) Dejarlo, respondiendo siempre `false`.
- **Recomendación:** (a).
  - Un `false` fijo es un dato engañoso: parece revisado cuando la función no existe.
  - YAGNI y EC-05: deja claro qué agrega el módulo comercial en el análisis de impacto del corte 3.
- **Decisión:** (a). El campo era opcional, así que quitarlo no rompe al frontend.

### 6. Estado de moderación

- **Contexto:** RF-005 RN7 exige moderar las tiendas sugeridas, pero en #50 nadie sugiere tiendas; solo entran las de la semilla (#51), revisadas por el equipo.
- **Opciones:**
  - (a) Agregar el estado cuando llegue la issue de sugerencias, con una migración que deje las existentes como aprobadas.
  - (b) Agregarlo ya, con todas aprobadas.
- **Recomendación:** (a).
  - YAGNI: una columna que siempre vale «aprobada» y un filtro que no descarta nada.
  - Agregarla después es barato, y se diseña mejor junto con la sugerencia y la detección de duplicados (RN3, RN7).
- **Decisión:** (a).

## Resumen

| Tema | Decisión |
|---|---|
| Ubicación del usuario | Solo para calcular la cercanía; no se guarda, no se registra, no se expone (grill común) |
| Coordenadas de la tienda | En la respuesta (grill común) |
| Tipos | `barrio`, `minimercado`, `supermercado` y `descuento` |
| Dirección | `address` opcional |
| Radio | 0,5 a 3 km, 2 por defecto (calibrable); fuera de rango, 400 |
| Coordenadas de la consulta y resultados | `lat` y `lng` validados; `limit` común (20 por defecto, 50 como máximo) |
| `hasVerifiedProfile` | Se quita hasta el módulo comercial |
| Moderación | Se agrega con la issue de sugerencias |
