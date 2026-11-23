# ADR-004: Separar escritura y lectura con un modelo de precio vigente precalculado

- **Estado:** Aceptado
- **Fecha:** 2026-11-12
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-02, EC-04
- **Requisitos relacionados:** RF-008, RF-009, RF-010, RF-016; RNF-002, RNF-004, RNF-011
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Estructura / P8 Inmediato vs diferido, P2 Vigencia
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b8167ab40c409defab2da)

Fuente: Notion, base ADRs, página 40239c4a833b8167ab40c409defab2da; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Nota de registro

Resuelto el 23-nov-2026: la propiedad Estado de Notion y `docs/DECISIONS.md` coinciden en «Aceptado el 12 de noviembre de 2026».

## Contexto

Las consultas son mucho más frecuentes que los registros (EC-04: p95 ≤ 2 s con 500 usuarios). Calcular la vigencia y la confiabilidad en cada lectura es costoso. EC-02 exige que un precio anterior deje de mostrarse como vigente dentro de un plazo definido. La guía pregunta qué debe responder de inmediato y qué puede actualizarse con retraso.

## Alternativas consideradas

A) Consulta directa sobre los reportes, calculando vigencia y score en cada lectura: simple, pero lenta bajo carga.

B) CQRS ligero: reportes append-only como modelo de escritura y una tabla de lectura "precio vigente por establecimiento y presentación", actualizada por eventos internos, más caché.

C) CQRS completo con Event Sourcing y broker de mensajes: máximo desacople, pero costo y complejidad excesivos para el alcance.

## Decisión

PROPUESTA: B) CQRS ligero. Inmediato: registrar un reporte y consultar la comparación. Diferido (segundos a minutos): cálculo de score, detección de anómalos, notificaciones e importaciones. Un cambio de precio oficial actualiza el modelo de lectura de forma síncrona, en la misma operación; el límite de aceptación es el de RNF-002 (máximo 5 minutos) y sirve de margen ante fallos. Un proceso programado reconstruye el modelo de lectura y marca como vencidos los precios que superen su TTL.

## Consecuencias

(+) Lecturas rápidas y predecibles (EC-04).

(+) La clasificación inmediato/diferido queda explícita y probada (RNF-011).

(−) Consistencia eventual solo en los procesos diferidos (score, detección de anómalos, notificaciones, importaciones). El precio oficial NO es eventual: se actualiza de forma síncrona y su retraso máximo es el de RNF-002; se prueba (RNF-002).

(−) Hay que poder reconstruir el modelo de lectura desde los reportes, y probarlo.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-004](https://app.notion.com/p/40239c4a833b8167ab40c409defab2da)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
