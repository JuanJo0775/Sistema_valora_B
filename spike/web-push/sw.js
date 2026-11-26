// Spike #256: service worker mínimo. Muestra el aviso y dice cuánto tardó en llegar.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Diagnóstico: le cuenta a la página abierta qué pasó dentro del service worker.
async function tell(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage(message);
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = { title: 'Valora', text: 'Aviso' };
      try {
        if (event.data) data = event.data.json();
      } catch (error) {
        await tell({ paso: 'payload ilegible', error: String(error) });
      }
      const ms = data.sentAt ? Date.now() - data.sentAt : null;
      await tell({ paso: 'push recibido por el service worker', ms });
      const text = ms === null ? data.text : `${data.text} · llegó en ${String(ms)} ms`;
      try {
        await self.registration.showNotification(data.title, {
          body: text,
          icon: '/icon-192.png',
          // La misma etiqueta agrupa los avisos de una cola en uno solo, sin llenar la bandeja.
          tag: 'spike',
          data: { url: '/' },
        });
        const abiertas = await self.registration.getNotifications();
        await tell({ paso: 'Chrome aceptó mostrarla', notificacionesAbiertas: abiertas.length });
      } catch (error) {
        await tell({ paso: 'showNotification falló', error: String(error) });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});
