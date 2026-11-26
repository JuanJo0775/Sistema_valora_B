# Spike #256: Web Push

Experimento para saber si llega una notificación al celular con la app cerrada. **No es código de producción y esta rama no se mezcla en `dev`.** Solo se mezcla el documento de resultados (`docs/decisiones/avisos/spike-web-push.md`).

## Correr

```bash
cd spike/web-push
npm install
node generate-keys.mjs        # claves VAPID de prueba en .env.spike (ignorado por Git)
SPIKE_TOKEN=valora node server.mjs
```

Abre `http://localhost:4000` (localhost cuenta como sitio seguro).

## Prueba 1: PC con Chrome

1. Toca **Activar avisos** y acepta el permiso.
2. Escribe el código (`valora`) y toca **Enviar aviso**. Debe aparecer la notificación y decir cuánto tardó.
3. Cierra la pestaña y vuelve a enviar con `curl -X POST localhost:4000/send -H "x-token: valora" -H "Content-Type: application/json" -d "{}"`. Debe llegar con la pestaña cerrada.

## Prueba 2: celular (Android o iPhone)

El celular necesita una dirección HTTPS. Con un túnel temporal:

```bash
npx cloudflared tunnel --url http://localhost:4000
```

El túnel deja el servidor visible en internet mientras corre; `/send` pide el código y no guarda nada más que la suscripción. Ciérralo al terminar.

- **Android (Chrome):** abre la dirección HTTPS, toca Activar avisos, acepta, cierra el navegador y envía desde el PC.
- **iPhone (Safari, iOS 16.4 o superior):** Compartir → **Agregar a pantalla de inicio**, abre la app desde el ícono, toca Activar avisos y acepta. En Safari normal el permiso no está disponible. Para iPhone cambia `VAPID_SUBJECT` en `.env.spike` por un correo de contacto del equipo.

## Qué anotar (para #256)

Dispositivo, navegador, si llegó con la app cerrada, milisegundos que dice el aviso, host del servicio de push (`fcm.googleapis.com`, `web.push.apple.com`…) y el código HTTP del envío. Para probar el 404 o 410, borra la suscripción desde los ajustes del navegador y vuelve a enviar.
