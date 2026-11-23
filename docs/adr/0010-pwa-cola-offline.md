# ADR-010: Cliente: aplicación web progresiva con cola de envío sin conexión

- **Estado:** Aceptado
- **Fecha:** 2026-10-30
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-01, EC-07
- **Requisitos relacionados:** en Notion hay 3 relaciones con RF y 3 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Estructura / sin dato en la fuente
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81d79bb4e1099a4022cc)

Fuente: Notion, base ADRs, página 40239c4a833b81d79bb4e1099a4022cc; estado copiado de Notion.

> El texto de las secciones Contexto a Consecuencias está copiado de las propiedades de texto de la fila; el cuerpo de la página de Notion se copia al final, tal cual (con sus títulos bajados un nivel). Los saltos `<br />` de las propiedades se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- **Discrepancia ADR-010 vs ADR-017.** Resuelto: ADR-017 está Aceptado desde el 8-nov-2026 (decisión «ACEPTADA (8 de noviembre de 2026)» en Notion).

## Contexto

El reportante registra precios frente a la góndola, con conectividad móvil limitada (EC-01: 15 s o menos en al menos el 80 % de los intentos). Los reportes deben guardarse localmente y enviarse luego sin duplicarse. El equipo es pequeño y no conviene mantener varias bases de código.

## Alternativas consideradas

A) Aplicación nativa Android e iOS: mejor acceso al dispositivo, pero doble desarrollo y publicación en tiendas.

B) PWA instalable con almacenamiento local, cola de envío y reintentos.

C) Sitio web responsive sin modo sin conexión: más simple, pero no cumple RF-007.

D) Reintentos automáticos sin cola persistente: solo cubre cortes breves y pierde los reportes si se cierra la app; no cubre sesiones sin señal (EC-07).

E) Dejar la fiabilidad en prioridad baja con reintentos simples: debilita el escenario de conectividad de EC-01 y no deja evidencia arquitectónica.

## Decisión

ACEPTADA: B) PWA con una sola base de código, cola local de reportes y clave de idempotencia por reporte (ADR-002). Alcance: solo el registro funciona sin conexión; la consulta requiere conexión. Cada reporte conserva la hora real de observación, separada de la hora de sincronización, y un reporte tardío nunca reemplaza a uno más reciente del mismo producto y establecimiento. El flujo de registro se diseña con mínimo de pasos y se valida con una prueba con usuarios en el corte 2.

## Consecuencias

(+) Una sola base de código, instalable y sin pasar por tiendas de aplicaciones.

(+) Apta para una prueba de usabilidad temprana con un prototipo.

(+) Fiabilidad queda en prioridad Media con evidencia medible: EC-07 y RNF-013 (100 % de 50 registros sincronizados, 0 duplicados, p95 de 60 s o menos).

(+) La hora de observación separada protege la actualidad del dato (RNF-002).

(−) En algunos sistemas móviles la sincronización en segundo plano es limitada y el envío ocurre al abrir la app; hay que probarlo y avisar al usuario.

(−) Hay que probar en teléfonos de gama baja y cumplir accesibilidad (RNF-008).

(−) La consulta sin conexión queda fuera de alcance y el usuario ve un aviso.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-010](https://app.notion.com/p/40239c4a833b81d79bb4e1099a4022cc)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente

## Cuerpo de la página de Notion (copiado tal cual)

### Relación con la implementación frontend

Este ADR define el requisito funcional de PWA con cola persistente offline-first y permanece <b>Aceptado</b>. No selecciona por sí mismo el framework ni la biblioteca del service worker. La propuesta de implementación se documenta en <mention url="https://app.notion.com/p/40d39c4a833b81aab6ebe8c4cf246552">Frontend PWA: React + Vite con vite-plugin-pwa</mention>, que continúa <b>Propuesto</b> hasta validación técnica.

La arquitectura visual está en las Figuras 3 (contenedores), 7 (secuencia de registro y sincronización) y 13 (despliegue) de <mention url="https://app.notion.com/p/40d39c4a833b80ffa47cfb7c2d06254e">Arquitectura y stack tecnológico</mention>. La decisión funcional aceptada sigue siendo la misma: la cola local conserva reportes sin conexión; la consulta de precios requiere conexión.
