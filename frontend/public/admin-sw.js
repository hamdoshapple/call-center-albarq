self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const conversationId = data.conversationId || '';
  const ticketId = data.ticketId || '';
  const callId = data.callId || '';

  let url = data.url || '/dashboard';
  if (conversationId) url = `/whatsapp-inbox?chat=${encodeURIComponent(conversationId)}`;
  else if (ticketId) url = `/admin-tickets?ticket=${encodeURIComponent(ticketId)}`;
  else if (callId) url = `/live-calls`;

  event.waitUntil(
    self.registration.showNotification(data.title || 'إشعار جديد', {
      body: data.body || data.message || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || ('admin-' + Date.now()),
      renotify: true,
      data: { ...data, url, conversationId, ticketId, callId },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/whatsapp-inbox', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          else client.postMessage({ type: 'FORCE_NAVIGATE', url: targetUrl });
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
