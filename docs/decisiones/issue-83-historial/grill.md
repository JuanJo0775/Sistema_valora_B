# Grill — issue #83: historial de precios de un producto

- **Relación:** RF-008 (RN1, RN3, RN4, escenario «Historial»), EC-02, EC-04, EC-08, ADR-004, ADR-015.
- **Fecha:** 15 de noviembre de 2026. Aprobado por el equipo en la conversación de trabajo.

## 1. ¿De dónde salen los datos?

**Decisión:** una tabla propia de `comparison`, `comparison.price_history`, alimentada por los mismos eventos que `price_current`. `PriceAssessed` inserta o actualiza una fila por reporte (un precio aprobado en moderación vuelve a llegar como «normal»); `PriceWithdrawn` lo marca como retirado. Ningún módulo lee tablas de otro.

**Descartado:** pedirle los datos a `reliability` por su interfaz: ata una consulta pública al módulo de moderación.

## 2. ¿Qué serie se muestra?

**Decisión:** una serie por presentación. Una sola serie por producto mezclaría 500 g y 1 kg. El filtro opcional `establishmentId` se mantiene.

## 3. Ventana y días

**Decisión:** los últimos 30 días, agrupados por día en hora de Colombia. Los días sin reportes no salen.

## 4. ¿Qué precios cuentan?

**Decisión:** no cuentan los descartados por moderación ni los sospechosos mientras nadie los apruebe; un precio anómalo no mueve el promedio. Los aprobados sí cuentan.

## 5. Fuente de cada precio (RN1)

**Decisión:** cada punto lleva `source: "reportado"`. Los precios oficiales llegan con `commerce` (Corte 3) sin cambiar la forma de la respuesta.

## 6. Datos que ya existen

**Decisión:** `pnpm comparison:rebuild-history` vuelve a leer del outbox los `PriceAssessed` y `PriceWithdrawn` ya entregados y los aplica en orden. Se puede correr varias veces.

## 7. Caché y privacidad

**Decisión:** pública, sin cuenta (RN3), `Cache-Control: public, max-age=300` y `ETag` (EC-04). Sin datos de quién reportó (EC-08): los eventos no los traen.
