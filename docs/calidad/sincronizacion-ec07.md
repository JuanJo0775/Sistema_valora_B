# Sincronización de la cola sin conexión (EC-07, PR-08)

- **Requisitos:** RF-007, EC-07, RNF-013, PR-07, PR-08, ADR-010.
- **Issue:** #30. Fecha: 15 de noviembre de 2026.
- **Cómo se reproduce:** `corepack pnpm exec jest test/integration/offline-sync.spec.ts --runInBand` (imprime el p95).
- **Alcance:** el lado del servidor. La cola en IndexedDB y la prueba con Playwright van en `Sistema_valora_F`.

## Resultado

| Criterio (PR-08) | Meta | Resultado |
|---|---|---|
| Reportes recibidos tras reconectar | 100 % | 50 de 50 |
| Duplicados | 0 | 0 (50 reportes y 50 eventos `PriceReported` para 150 envíos) |
| p95 de confirmación tras reconectar | 60 s o menos | Alrededor de 1 s (762 ms y 1142 ms en dos corridas locales) |
| Un reporte tardío no reemplaza uno más reciente | Sí | Cada tienda muestra el reporte observado más tarde |

## Cómo se midió

- Una cuenta con 50 reportes en la cola: uno cada 15 minutos durante unas 12 horas, en 10 tiendas.
- Al reconectar, cada reporte se manda **dos veces al mismo tiempo** (la PWA reintenta porque no vio la respuesta) y **una tercera vez después**, en desorden: 150 envíos.
- Todas las respuestas son 201 o 200; la base queda con 50 reportes y 50 eventos.
- El p95 es el tiempo desde que empieza la sincronización hasta que cada reporte tiene su respuesta, medido en el servidor de pruebas local (sin la red del teléfono).

## Lo que cambió para cumplirlo

Los límites de la #29 (duplicado y ráfaga) contaban por la hora de **llegada**. Al reconectar, la cola mandaba sus 50 reportes juntos y desde el 21 respondía 429, aunque se hubieran visto a lo largo del día. Desde la #30 cuentan por la hora de **observación** (grill de la #30, pregunta 2):

- Duplicado: misma cuenta, presentación y tienda con observaciones a menos de 60 minutos.
- Ráfaga: más de 20 reportes de la cuenta observados dentro de una misma hora, en cualquier orden de llegada.

## Qué hace la cola con cada respuesta

| Respuesta | Qué hace la cola |
|---|---|
| 201 o 200 | Confirmado: sale de la cola. |
| 400, 409 o 422 | Final: sale de la cola y avisa por qué. |
| 429 (ráfaga) de un reporte que ya estaba en la cola | Final: su hora de observación no cambia, así que no pasará. Sale de la cola y avisa. |
| 401 o 403 | Pide iniciar sesión y espera; luego reintenta con la misma clave. |
| Sin red o 5xx | Reintenta más tarde con la misma clave. |

## Límites de la medición

- Se mide el servidor, no la red del teléfono ni el navegador: el p95 real se mide con Playwright en el frontend.
- Quien quiera evitar la ráfaga puede repartir horas de observación falsas dentro de las 24 h permitidas; la detección de anómalos y la moderación siguen aplicando.
