
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
  const callId = data.callId || '';

  let url = data.url || '/employee/dashboard';
  if (ticketId) url = `/employee/tickets?ticket=${encodeURIComponent(ticketId)}`;
  else if (conversationId) url = `/employee/whatsapp?chat=${encodeURIComponent(conversationId)}`;
  else if (callId) url = `/employee/calls?call=${encodeURIComponent(callId)}`;

  event.waitUntil(
    self.registration.showNotification(data.title || 'إشعار جديد', {
      body: data.body || data.message || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || ('employee-' + Date.now()),
      renotify: true,
      data: { ...data, ticketId, conversationId, callId, url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/employee/tickets', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes('/employee')) {
          await client.focus();

          if ('navigate' in client) {
            await client.navigate(targetUrl);
          } else {
            client.postMessage({ type: 'FORCE_NAVIGATE', url: targetUrl });
          }

          client.postMessage({
            type: data.callId ? 'CALL_OPEN_FROM_PUSH' : 'TICKET_OPEN_FROM_PUSH',
            payload: {
              ticketId: data.ticketId || '',
              callId: data.callId || '',
              url: targetUrl,
            },
          });
          return;
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
