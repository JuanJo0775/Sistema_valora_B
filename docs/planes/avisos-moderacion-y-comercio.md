# Plan: avisos a moderación y comercio (campana y Web Push)

**Objetivo:** que un moderador o un comercio se entere de lo pendiente sin revisar a mano: una campana con contador dentro de la app y una notificación push al celular cuando la app está cerrada.
**Épica:** #255. **RF / EC / ADR:** RF-012, RF-013 (moderación), EC-04, EC-05, EC-08, ADR-010, ADR-012, ADR-015, ADR-031, ADR-032, ADR-037, ADR-038. ADR propuestos: 0043, 0044 y 0045. El escenario de calidad y el RF nuevo están por acordar con el equipo (no se numeran todavía).
**Fecha:** 25 de noviembre de 2026.

## Decisiones tomadas

- Campana con sondeo de 60 s mientras la app está visible; un número por pestaña del panel.
- Web Push (VAPID) para la app cerrada. **WebSocket y SSE** solo funcionan con la app abierta y los **webhooks** son de servidor a servidor, así que no sirven para llegar a un celular.
- El contenido de la notificación va cifrado de extremo a extremo; el servicio de push (Google, Apple, Mozilla) no puede leerlo.
- En iPhone solo funciona con la PWA instalada en la pantalla de inicio (iOS 16.4 o superior).

## Pasos

| # | Issue | Qué entrega |
|---|---|---|
| 0 | #256 | Spike: ¿llega una notificación con la app cerrada en Android, iPhone, Vercel y Render? Decide si se sigue. |
| 1 | #257 | `GET /v1/moderation/summary` con el conteo por cola (`/tdd`). |
| 2 | Sistema_valora_F#212 | Campana y contador para moderador y comercio. |
| 3 | #258 | ADR-043 a 045, escenario de calidad y requisito; reglas de arquitectura. |
| 4 | #259 | Módulo `notifications` y suscripciones push (`/nuevo-modulo`, `/tdd`). |
| 5 | #260 | Envío de avisos desde el outbox (`/tdd`). |
| 6 | Sistema_valora_F#213 | Activar push desde la PWA (permiso, suscripción, service worker). |
| 7 | #261 | Evidencia en Android e iPhone y medición de latencia. |

## Recorte si falta tiempo

1. **Imprescindible:** spike, contador con campana y push al moderador solo por «reporte en cola».
2. **Si sobra:** reclamos y propuestas de tienda o producto, y los avisos del comercio.
3. **Al final:** preferencias por tipo de aviso.

## Riesgos y decisiones abiertas

- Solo `PriceAssessed`, `PriceFlagged` y `MerchantVerified` están confirmados como eventos del outbox. Hay que verificar que reclamos, propuestas y casos de comercio también publiquen uno; si no, se crean (#260).
- Una notificación por evento puede saturar: etiqueta de agrupación por cola y límite por cuenta desde el primer envío.
- El plan gratuito de Render duerme el servicio; el spike (#256) lo comprueba.
- La medición del escenario de calidad llega hasta el servicio de push: la entrega al celular depende de Google o Apple.

## Escenario de calidad propuesto (borrador)

- **Estímulo:** un caso queda pendiente en moderación, o a un comercio se le vence una confirmación.
- **Entorno:** operación normal; PWA instalada con el permiso concedido y la app cerrada.
- **Respuesta:** se envía una notificación sin datos personales; al tocarla abre la pantalla correspondiente; ante 404 o 410 del servicio de push se borra la suscripción.
- **Medida:** al menos el 95 % llega al servicio de push en 60 s o menos; el payload no trae campos identificadores (prueba automática); 0 dependencias del núcleo hacia `notifications` (depcheck); si el envío falla, registrar un reporte no se ve afectado (EC-04).

## Fuera de alcance

Correo al moderador, asignación de casos, historial «leído / no leído» y avisos al usuario cuando se decide su solicitud.
