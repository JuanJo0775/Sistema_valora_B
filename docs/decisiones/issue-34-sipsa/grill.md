# Grill — issue #34: referencia SIPSA

- **Relación:** RF-014 (RN1 a RN5), ADR-011, EC-02, PR-20.
- **Fecha:** 15 de noviembre de 2026. Las 6 decisiones las aprobó el equipo en la conversación de trabajo.
- **Restricción de arquitectura:** `imports` es un módulo de soporte y no puede depender del núcleo. La referencia vive en `catalog` y `comparison` la lee por la interfaz pública de `catalog`.

## Lo que ya estaba

- Carga idempotente de tiendas y productos con origen, fecha y responsable (#51, `pnpm db:seed`).
- Sin scraping ni integración automática (ADR-011).

## 1. ¿Dónde se ve la referencia?

**Decisión:** en la comparación de un producto, en un bloque aparte `wholesaleReference` que nunca entra al orden ni a `isCheapest` (RN3). **Descartado:** mostrarla solo al moderador; ayuda menos al consumidor.

## 2. ¿Cómo se carga?

**Decisión:** `seed/sipsa.csv`, llenado a mano por el equipo desde el boletín SIPSA del DANE (RN1, RN4), cargado por `pnpm db:seed` con las mismas reglas de la #51: solo filas verificadas, todo o nada y sin duplicar. Columnas: `producto`, `marca`, `producto_sipsa`, `mercado`, `inicio_periodo`, `fin_periodo`, `precio_kg`, `url_fuente`, `verificar`, `responsable` y `fecha_consulta` (RN5).

## 3. ¿Cuándo es comparable (RN2)?

**Decisión:** solo si el producto está en `productos.csv` (verificado) y su unidad es de peso (g o kg): SIPSA publica pesos por kilo. Si no, el error nombra la fila. La referencia se muestra solo si su periodo terminó hace 30 días o menos; si es más vieja, no se muestra.

## 4. Muestra de exactitud (PR-22)

**Decisión:** va en la issue #93 (archivo de precios observados en tienda y el comando `pnpm quality:accuracy`).

## 5. ¿Precios iniciales en la semilla?

**Decisión:** no. Una fuente «siembra» cambiaría `pricing` y `comparison`. Los precios iniciales llegan como reportes de cuentas del equipo cuando exista el frontend.

## 6. ¿Se divide?

**Decisión:** sí. La #34 cubre SIPSA (preguntas 1 a 3); la #93, la muestra de exactitud.
