# ADR-043: Contador y campana de avisos con sondeo

- **Estado:** Propuesto
- **Fecha:** 2026-11-25
- **Responsables:** equipo de backend y frontend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-04 (consulta barata), EC-08 (privacidad)
- **Requisitos relacionados:** RF-012 y RF-013 (moderación), RF-016 (precios oficiales, avisos del comercio), requisito propuesto «Avisos a moderación y comercio» (`docs/decisiones/avisos/escenario-y-requisito.md`), ADR-031 (ahorro de ancho de banda), ADR-038

## Contexto

Un moderador debe abrir a mano cinco colas para saber si algo espera su decisión: reportes de precios, tiendas, productos, casos de comercio y precios oficiales sin referencia. El comercio solo recibe un correo diario. Ninguna parte de la app avisa de lo pendiente cuando la persona la tiene abierta.

El spike #256 mostró que un aviso por Web Push llega con la app cerrada (ADR-044), pero con la app abierta hace falta un lugar donde ver cuántos casos hay, que además funcione sin conceder el permiso de notificaciones ni, en iPhone, tener la PWA instalada.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Campana con sondeo cada 60 s | Simple, sin estado en el servidor, sin conexiones abiertas, funciona en cualquier navegador | El número puede ir hasta 60 s atrasado; una consulta por minuto y por persona |
| B. WebSocket o SSE | Aviso casi instantáneo con la app abierta | Una conexión abierta por persona; frágil con el plan gratuito de Render, que duerme el servicio; no llega con la app cerrada |
| C. Consultar solo al abrir la app o al enfocar la pestaña | Menos consultas | El número queda viejo si la pestaña sigue abierta |
| D. Bandeja con historial («leído» y «no leído») | Se ve qué pasó mientras no se estaba | Tabla nueva, estado por cuenta, pantalla de historial; fuera del alcance |
| E. Solo notificaciones push | Una sola vía | No cubre a quien no concedió el permiso ni al iPhone sin la PWA instalada |

## Decisión

1. **El número sale de dos fuentes que ya existen.** El moderador usa `GET /v1/moderation/summary` (#257, un entero por pestaña: `precios`, `tiendas`, `productos`, `comercios`). El comercio usa `GET /v1/commerce/alerts` (avisos de vencimiento y de discrepancia). No hay backend nuevo para el comercio.
2. **Campana en el encabezado** para las cuentas moderador y comercio, con el total y una lista desplegable. Cada fila del moderador lleva a su pestaña del panel (`/moderacion?vista=…`); las del comercio, a la pantalla del aviso. Números también en las pestañas del panel.
3. **Sondeo cada 60 s mientras la pestaña está visible** y al volver a enfocarla; ninguna consulta con la pestaña oculta. Si falla, no muestra nada ni bloquea la pantalla. El intervalo es provisional y parametrizable.
4. **Es una campana de pendientes por atender, no una bandeja.** No hay «leído» ni «no leído»: el número baja cuando se decide el caso o el comercio reconfirma. El historial queda fuera de alcance.
5. **Accesible:** el número también va en texto («3 pendientes») para lector de pantalla, no solo en color.

Queda fuera: avisar con la app cerrada (ADR-044), correo al moderador y preferencias por tipo de aviso.

## Consecuencias

- Positivas: sin estado nuevo en el servidor; una consulta de conteo barata; el mismo componente sirve a dos roles; no depende de permisos del navegador.
- Negativas / riesgos: el aviso puede tardar hasta 60 s; cada persona con la app abierta hace una consulta por minuto (un `COUNT` sin caché, sin carga relevante a esta escala); no hay historial.
- Trade-offs aceptados: se prefiere la simplicidad del sondeo al tiempo real con conexiones abiertas. Para la app cerrada se usa Web Push (ADR-044).

## Verificación

- #257 (mezclado): prueba de contrato, matriz de autorización y prueba de integración con el conteo igual al de cada lista.
- Frontend (Sistema_valora_F#212): pruebas del hook (cero, error, pausa con la pestaña oculta), de la campana por rol y de accesibilidad.

## Referencias

- Notion: [EPIC-B09](https://app.notion.com/p/424056e503118169a2a5ed1fcc5e5cab)
- Issues / PRs: #255, #257, #258; Sistema_valora_F#212
