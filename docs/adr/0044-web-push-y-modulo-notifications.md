# ADR-044: Web Push y un módulo `notifications` alimentado por el outbox

- **Estado:** Aceptado
- **Fecha:** 2026-11-25
- **Responsables:** equipo de backend; aceptado el 25 de noviembre de 2026.
- **Escenarios relacionados:** EC-09 (aviso oportuno a moderación y comercio), EC-04 (el registro de un reporte no se ve afectado), EC-05 (el núcleo no conoce el módulo nuevo), EC-08 (privacidad)
- **Requisitos relacionados:** requisito «Avisos a moderación y comercio» (por numerar) (`docs/decisiones/avisos/escenario-y-requisito.md`), RF-012, RF-013, ADR-010 (PWA), ADR-012 (despliegue), ADR-015 (outbox), ADR-043 (campana), ADR-045 (suscripciones y privacidad)

## Contexto

El sondeo de la campana (ADR-043) solo funciona con la app abierta. Un moderador o un comercio con la app cerrada no se entera de lo pendiente. Lo que se quiere es lo que hace cualquier app en el celular: un mensaje en la bandeja de notificaciones.

El spike #256 (`docs/decisiones/avisos/spike-web-push.md`) probó Web Push con claves VAPID en tres dispositivos y el aviso llegó con la app cerrada: PC con Chrome, Android con Chrome e iPhone con la PWA instalada. Tiempo de llegada medido en 553 ms (Android) y 700 ms (PC); el servicio de push aceptó el mensaje en 186 a 4.035 ms.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Web Push estándar con claves VAPID y la librería `web-push` | Llega con la app cerrada; sin cuenta en un servicio de terceros; el contenido va cifrado de extremo a extremo; probado en el spike | Depende de Google y Apple para la entrega; en iPhone exige la PWA instalada; claves que custodiar |
| B. WebSocket o SSE | Tiempo real con la app abierta | No llega con la app cerrada |
| C. Webhooks | Estándar entre servidores | Son de servidor a servidor: no hay un servidor del otro lado, solo un celular |
| D. Servicio de terceros (OneSignal, SDK de Firebase) | Panel de envío y soporte de dispositivos | Cuenta y datos de las personas en un tercero, dependencia nueva, contradice la privacidad por diseño (ADR-013) |
| E. Correo al moderador (Resend ya está configurado) | Barato y conocido | No es inmediato ni se ve como notificación; se deja como alternativa sobre el mismo puerto |
| F. App nativa con notificaciones | Máxima fiabilidad | Fuera del alcance: el cliente es una PWA (ADR-017) |

## Decisión

1. **Canal:** Web Push estándar con claves VAPID y la librería `web-push`, sin servicio de terceros. El contenido viaja cifrado; el servicio de push no puede leerlo.
2. **Módulo `notifications`** con la estructura estándar (`index.ts`, `application/`, `infrastructure/`, `http/`) y su esquema de base `notifications`. No es del núcleo ni de soporte.
3. **Se alimenta del outbox (ADR-015)** y nadie lo llama de forma directa. Los módulos que producen un hecho publican su evento como siempre; `notifications` lo recibe, decide a quién avisar y envía. La entrega es al menos una vez y se hace idempotente por evento y destinatario. Un fallo del envío no cambia la operación que lo originó (EC-04).
4. **Regla de dependencia:** ningún módulo importa `notifications`; solo `AppModule` lo registra. `notifications` importa de otros módulos únicamente por su `index.ts` (por ejemplo, de `identity` para saber quién es moderador). Se agrega la regla `nadie-conoce-notifications` a dependency-cruiser.
5. **Puerto `PushSender` con dos adaptadores:** `console` (desarrollo y pruebas) y `webpush` (producción), elegidos con `PUSH_PROVIDER`, igual que `EMAIL_PROVIDER`.
6. **Qué avisa y a quién:**
   - Moderador: un reporte entra a la cola (sospechoso o marcado), un precio oficial sin referencia, una solicitud o denuncia o disputa de comercio, una propuesta de tienda, una solicitud de producto.
   - Comercio: una discrepancia corroborada y el vencimiento próximo de una confirmación (desde el planificador del resumen diario).
   - Los eventos que hoy no existen se crean en #260 sin que el módulo que los publica conozca a `notifications`.
7. **Contenido:** texto genérico con un conteo («Tienes 3 casos por revisar») y la dirección a abrir; nunca nombres de tiendas ni de productos ni nada de quien reportó (EC-08). Una etiqueta (`tag`) por cola agrupa los avisos en una sola notificación, y se envía como máximo un aviso por cola y por cuenta cada 5 minutos (valor provisional, parametrizable). TTL del mensaje de una hora.
8. **iPhone:** solo con la PWA instalada; la pantalla lo explica (spike #256).

Queda fuera: correo al moderador, preferencias por tipo de aviso, avisos al reportante y el historial de avisos.

## Consecuencias

- Positivas: llega con la app cerrada; sin SaaS de terceros; reutiliza el outbox y el patrón de adaptadores del correo; el núcleo no se entera (EC-05).
- Negativas / riesgos: la entrega depende de Google y Apple y es de mejor esfuerzo; Apple rechaza una firma con un contacto no válido (`403 BadJwtToken` en el spike); cambiar la clave VAPID invalida todas las suscripciones; un módulo nuevo que mantener; el plan gratuito de Render duerme el servicio (por comprobar en #260).
- Trade-offs aceptados: se acepta la dependencia de los servicios de push de los navegadores a cambio de no ceder datos a un tercero. La latencia que se mide es hasta que el servicio de push acepta el mensaje, porque el reloj de un dispositivo puede estar atrasado (el del iPhone iba unos dos minutos).

## Verificación

- Spike #256 (`docs/decisiones/avisos/spike-web-push.md`): los tres dispositivos.
- dependency-cruiser: la regla `nadie-conoce-notifications` en `pnpm depcheck`.
- #259 y #260: pruebas de la regla de audiencia, de que un fallo de envío no cambia la respuesta de `POST /v1/reports` y de que el contenido no trae campos identificadores.
- #261: pruebas manuales en Android e iPhone y medición del p95 hasta la aceptación del servicio de push (meta: 95 % en 60 s o menos).

## Referencias

- Notion: [EPIC-B09](https://app.notion.com/p/424056e503118169a2a5ed1fcc5e5cab)
- Issues / PRs: #255, #256, #258, #259, #260, #261; PR #263 (resultados del spike)
