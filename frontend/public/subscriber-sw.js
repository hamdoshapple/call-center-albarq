self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'إشعار جديد', {
      body: data.body || data.message || '',
      icon: data.icon || '/icons/apple-touch-icon.png',
      badge: data.badge || '/icons/apple-touch-icon.png',
      tag: data.tag || 'albarq',
      data: { url: data.url || '/my' },
      dir: 'rtl',
      lang: 'ar',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/my';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        client.navigate(url);
        return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
