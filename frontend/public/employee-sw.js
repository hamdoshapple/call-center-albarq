const CACHE_NAME = 'albarq-staff-v-' + Date.now();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('albarq-staff-v-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || 'رسالة واتساب جديدة';
  const tag = data.conversationId ? `wa-chat-${data.conversationId}` : (data.tag || 'albarq-staff-wa');

  const options = {
    body: data.body || 'وصلت رسالة جديدة',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag,
    renotify: false,
    requireInteraction: false,
    dir: 'rtl',
    lang: 'ar',
    data: {
      url: data.url || '/employee/whatsapp',
      conversationId: data.conversationId || '',
      unread: Number(data.unread || 1),
    },
  };

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage({ type: 'WA_PUSH_MESSAGE', payload: data });
    }

    if (self.registration.setAppBadge) {
      await self.registration.setAppBadge(Number(data.unread || 1)).catch(() => null);
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/employee/whatsapp';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
