/* eslint-disable no-undef */
/**
 * Service worker: recibe Web Push y muestra notificación (funciona con pestaña cerrada).
 * Debe estar en la raíz del sitio (copiado desde public/ por Vite).
 */
self.addEventListener('push', function (event) {
  let data = {
    title: 'Dailys · Chat',
    body: '',
    url: '/chat',
    tag: 'dailys-chat',
    icon: 'https://i.imgur.com/uQrmMqG.png',
  };
  try {
    const t = event.data ? event.data.text() : '';
    if (t) Object.assign(data, JSON.parse(t));
  } catch (_) {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.icon,
      tag: data.tag || 'dailys-chat',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const path = event.notification.data?.url || '/chat';
  const url = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const c of clientList) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          if ('navigate' in c && typeof c.navigate === 'function') {
            c.navigate(url);
          }
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
