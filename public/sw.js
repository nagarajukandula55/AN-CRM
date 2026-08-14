// Web Push service worker -- pops a real browser/OS notification even when
// this tab isn't open/focused. Deliberately minimal: no asset caching /
// offline support here, this worker exists purely for push + notification
// click, not a PWA install experience.

self.addEventListener('push', (event) => {
  let data = { title: 'My Biz Flow', body: '', link: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/screenshots/icon-192.png',
      badge: '/screenshots/icon-192.png',
      data: { link: data.link || '/' },
      tag: data.tag || undefined,
    }).catch(() => {
      // Icon path may not exist in every deployment -- retry without it
      // rather than silently dropping the notification.
      return self.registration.showNotification(data.title, {
        body: data.body,
        data: { link: data.link || '/' },
        tag: data.tag || undefined,
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(link) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
