# Spike de Web Push (#256)

**Fecha:** 25 de noviembre de 2026. **Épica:** #255. **Kit:** rama `spike/web-push` (no se mezcla en `dev`), carpeta `spike/web-push/`.

## Pregunta

¿Podemos mandar una notificación al celular o al computador **con la app cerrada** usando Web Push (VAPID), con la infraestructura del proyecto?

## Método

Un servidor mínimo en Node con la librería `web-push` 3.6.7, una página que pide el permiso al tocar un botón, y un service worker que muestra el aviso. Claves VAPID de prueba. Para los celulares, un túnel HTTPS temporal hacia el computador. Cada aviso lleva la hora de envío; el service worker calcula cuánto tardó en llegar.

## Resultados

| Dispositivo | Navegador o app | Estado de la app | Servicio de push | Respuesta del envío | ¿Llegó? |
|---|---|---|---|---|---|
| PC con Windows 11 | Chrome (perfil administrado de un centro educativo) | Pestaña abierta | `fcm.googleapis.com` | 201 | Sí. El service worker lo recibió en 700 ms. |
| PC con Windows 11 | Chrome | Pestaña cerrada | `fcm.googleapis.com` | 201 en 578 ms | Sí, en el centro de notificaciones de Windows. |
| iPhone | PWA instalada desde Safari | Cerrada, pantalla bloqueada | `web.push.apple.com` | 201 en 543 ms | Sí, en la pantalla de bloqueo, como notificación de la app instalada. |
| Android | Chrome | Cerrado, pantalla bloqueada | `fcm.googleapis.com` | 201 en 186 ms | Sí, como notificación de Chrome. Dice «llegó en 553 ms». |

Tiempo en que el servicio de push aceptó el mensaje (respuesta 201 del servidor): entre 186 y 1.718 ms con Google en diez envíos, y entre 543 y 4.035 ms con Apple en dos.

Tiempo de llegada al dispositivo, medido con el reloj de cada uno: 553 ms en Android y 700 ms en el PC.

## Hallazgos

1. **Funciona con la app cerrada** en el computador, en Android y en el iPhone. El mensaje viaja cifrado por el servicio de push del navegador; el servicio no lee su contenido.
2. **Apple rechaza una firma VAPID con un contacto no válido.** Con `VAPID_SUBJECT=mailto:equipo@valora.example` respondió `403 BadJwtToken`. Con una dirección `https` válida respondió 201. En producción el contacto debe ser un correo institucional del equipo o la dirección del sitio, nunca el correo personal de una persona, porque viaja a Google y a Apple dentro de la firma.
3. **La latencia de llegada solo es fiable si el reloj del dispositivo está al día.** El reloj del iPhone iba unos dos minutos atrasado y el aviso decía «llegó en −120745 ms»; el aviso sí llegó, pero ese número no sirve. En Android (553 ms) y en el PC (700 ms) los relojes estaban bien. El escenario de calidad debe medir hasta que el servicio de push acepta el mensaje, en el servidor, que es lo que controlamos.
4. **En iPhone solo funciona con la PWA instalada** en la pantalla de inicio. Abierta en Safari normal no hay permiso de notificaciones. La pantalla debe explicar cómo instalarla.
5. **La etiqueta (`tag`) agrupa los avisos.** Varios envíos con la misma etiqueta dejan una sola notificación en Windows, sin apilarlos. Sirve para no saturar a un moderador.
6. **El permiso se pide al tocar un botón,** nunca al cargar la página.
7. **Windows puede no mostrar el banner emergente** aunque Chrome cree la notificación: en la prueba quedó en el centro de notificaciones (Win + N). Depende del Asistente de concentración o de los banners de Chrome en Windows. No afecta al diseño.
8. **El perfil administrado de un centro educativo no bloqueó** las notificaciones.
9. **El texto debe enviarse en UTF-8.** Un envío de prueba desde una terminal de Windows mostró «pesta�a». En el backend real el JSON ya va en UTF-8.

## No comprobado todavía

- Qué responde el servicio de push cuando la suscripción caduca (404 o 410). El kit borra la suscripción en ese caso, pero no se provocó.
- Desde Render y Vercel reales: el spike corrió en el computador con un túnel, no en el despliegue. Falta comprobar el envío desde Render dormido y la suscripción por `/v1/*` reenviado desde Vercel.
- Integración con el service worker de la PWA (`generateSW`, `workbox.importScripts`): el spike usó un service worker propio.

## Recomendación

**Sí, seguir** con la épica. La parte de mayor riesgo, que el aviso llegue con la app cerrada, funciona en el computador, en Android y en el iPhone. Lo que queda sin comprobar (404 o 410, envío desde Render y Vercel, y la integración con el service worker de la PWA) pasa como criterio de aceptación a #259 y #260.
