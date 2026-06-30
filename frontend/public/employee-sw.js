self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}

  const ticketId = data.ticketId || '';
  const conversationId = data.conversationId || '';

  let url = data.url || '/employee';
  if (ticketId) url = `/employee/tickets?ticket=${encodeURIComponent(ticketId)}`;
  else if (conversationId) url = `/employee/whatsapp?chat=${encodeURIComponent(conversationId)}`;

  event.waitUntil(
    self.registration.showNotification(data.title || 'إشعار جديد', {
      body: data.body || data.message || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || ('employee-' + Date.now()),
      renotify: true,
      data: {
        ...data,
        ticketId,
        conversationId,
        url,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = new URL(data.url || '/employee', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if (client.url.includes('/employee')) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url);
          } else {
            client.postMessage({ type: 'FORCE_NAVIGATE', url });
          }
          return;
        }
      }

      return clients.openWindow(url);
    })
  );
});
