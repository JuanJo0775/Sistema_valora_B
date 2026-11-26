// Spike #256: service worker mínimo. Muestra el aviso y dice cuánto tardó en llegar.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Valora', text: 'Aviso' };
  const ms = data.sentAt ? Date.now() - data.sentAt : null;
  const text = ms === null ? data.text : `${data.text} · llegó en ${String(ms)} ms`;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: text,
      icon: '/icon-192.png',
      // La misma etiqueta agrupa los avisos de una cola en uno solo, sin llenar la bandeja.
      tag: 'spike',
      data: { url: '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});
