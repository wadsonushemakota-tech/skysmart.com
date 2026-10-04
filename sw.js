/* Minimal service worker — enables “Add to Home Screen” / installed PWA behavior */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a new-order notification opens (or focuses) the orders dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.includes('/admin.html'));
      return open ? open.focus() : self.clients.openWindow('/admin.html');
    })
  );
});
