/* Service worker: cho phép cài như app + chạy offline + hiện thông báo.
   Chỉ hoạt động khi trang được phục vụ qua http/https (không chạy với file://).
   Hai hằng số dưới đây được build.js thay bằng mã băm thật khi tạo dist/. */
const VERSION = 'dev';
const ASSETS = [
  './', './index.html', './css/style.css',
  './js/state.js', './js/lunar.js', './js/voice.js', './js/sync.js',
  './js/notify.js', './js/views.js', './js/app.js',
  './manifest.webmanifest', './icon.svg',
  './assets/icon-192.png', './assets/icon-512.png',
  './assets/apple-touch-icon.png', './assets/favicon-32.png'
];

const CACHE = 'lifehub-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* Một tệp lỗi không được làm hỏng cả lần cài đặt */
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // không đụng vào Supabase

  /* Trang chính: ưu tiên mạng để cập nhật mới về ngay, mất mạng thì lấy bản đã lưu */
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)).catch(() => {}); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* Tệp có ?v=… là bản đã đóng dấu phiên bản, không bao giờ đổi nội dung
     → lấy thẳng từ bộ nhớ đệm, mở app gần như tức thì. */
  if (url.searchParams.has('v')){
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)).catch(() => {}); return res; })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
