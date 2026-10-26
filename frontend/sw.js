// sw.js — Soul Diary Service Worker v2.5 (v3.3.1 — security/bug review follow-up)
const CACHE_NAME    = 'souldiary-v43';
// admin.js/game.js không precache — trang chính nạp lười, chỉ cache khi user thật sự mở tới
const STATIC_ASSETS = [
  '/', '/index.html',
  '/css/style.css',
  '/js/config.js', '/js/data.js', '/js/app-utils.js', '/js/api.js',
  '/js/auth.js', '/js/pages.js', '/js/app.js',
  '/soul-diary-logo.jpg', '/app-icon.jpg',
  '/manifest.webmanifest',
];

// ── Install: cache static shell ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache:'reload' — tải thẳng từ server, bỏ qua HTTP cache của trình duyệt (IIS không gửi Cache-Control
      // nên trình duyệt tự đoán hạn và có thể đưa bản cũ → bản cache mới lẫn file cũ sau deploy)
      .then(cache => cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' }))).catch(() => {}))
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

  // Static assets: stale-while-revalidate — trả bản cache ngay cho nhanh, đồng thời tải bản mới
  // về cache cho lần mở sau. Nhờ vậy deploy JS/CSS mới tự tới người dùng, không phải nhớ bump CACHE_NAME.
  // cache:'no-cache' — luôn hỏi lại server (file không đổi chỉ tốn 1 phản hồi 304), tránh lấy bản cũ từ HTTP cache
  const network = fetch(event.request, { cache: 'no-cache' }).then(response => {
    // Cache API chỉ nhận request http/https — request từ extension khác
    // (chrome-extension://, ...) lọt vào đây sẽ làm cache.put() ném lỗi.
    if (response && response.status === 200 && event.request.method === 'GET' && url.protocol.startsWith('http')) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
    }
    return response;
  });
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network.catch(() => caches.match('/index.html'));
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
  // v3.11: nút ghi mood ngay trên thông báo — Chrome tối đa 2 nút (Notification.maxActions)
  if (data.quick_mood) {
    options.actions = [
      { action: 'mood-8', title: '🙂 Tốt' },
      { action: 'mood-4', title: '😕 Buồn' },
    ];
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click → mở app ──────────────────────────────────────────
// Bấm nút mood: SW không đọc được token đăng nhập (nằm ở localStorage của trang) nên mở app với
// ?quickmood=<điểm>, App.init tự ghi Quick Mood rồi xoá tham số khỏi URL.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const mood = /^mood-(\d+)$/.exec(event.action || '');
  const url  = mood ? `/?quickmood=${mood[1]}` : (event.notification.data?.url || '/');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      // navigate() chỉ chạy với tab do SW này điều khiển — tab chưa được điều khiển thì mở tab mới
      if (existing) return mood
        ? existing.navigate(url).then(c => (c || existing).focus()).catch(() => clients.openWindow(url))
        : existing.focus();
      return clients.openWindow(url);
    })
  );
});
