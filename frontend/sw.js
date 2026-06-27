// sw.js — Soul Diary Service Worker v2.0
const CACHE_NAME    = 'souldiary-v2';
const OFFLINE_URL   = '/offline.html';
const STATIC_ASSETS = [
  '/', '/index.html',
  '/css/style.css',
  '/js/config.js', '/js/data.js', '/js/api.js',
  '/js/auth.js', '/js/pages.js', '/js/admin.js', '/js/app.js',
  '/soul-diary-logo.jpg', '/app-icon.jpg',
  '/manifest.webmanifest',
];

// ── Install: cache static shell ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: xóa cache cũ ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first cho static, network-first cho API ─────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls: network-first, không cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ message: 'Không có kết nối mạng.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── Push notification ─────────────────────────────────────────────────────
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

// ── Notification click → mở app ──────────────────────────────────────────
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
