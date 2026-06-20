// sw.js — Soul Diary Service Worker (Web Push)
const CACHE_VERSION = 'souldiary-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Nhận push notification từ server
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) {}
  const title   = data.title || 'Soul Diary 📖';
  const options = {
    body:    data.body || 'Hãy ghi nhật ký hôm nay!',
    icon:    '/soul-diary-logo.jpg',
    badge:   '/soul-diary-logo.jpg',
    vibrate: [200, 100, 200],
    tag:     'souldiary-reminder',
    renotify: false,
    data:    { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Bấm vào notification → mở app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
