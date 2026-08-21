/* ============================================================
   Service worker — cài như app, chạy offline, hiện thông báo.
   Chỉ hoạt động qua http/https (không chạy với file://).

   Không còn bước dựng nên tên tệp không kèm mã phiên bản nữa.
   Vì vậy cách làm ở đây là "dùng bản đã lưu trước, kiểm bản mới sau":
   trang mở ra tức thì từ bộ nhớ đệm, đồng thời tải lại ngầm để so.
   Thấy khác là báo cho trang biết để mời bạn tải lại.
   ============================================================ */
const CACHE = 'lifehub';

const ASSETS = [
  './', './index.html', './css/style.css',
  './js/state.js', './js/lunar.js', './js/voice.js', './js/api.js', './js/sync.js',
  './js/notify.js', './js/views.js', './js/app.js',
  './manifest.webmanifest', './icon.svg',
  './assets/icon-192.png', './assets/icon-512.png',
  './assets/apple-touch-icon.png', './assets/favicon-32.png'
];

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
    /* dọn các bộ nhớ đệm của những bản cũ, kể cả bản có mã phiên bản ngày xưa */
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Dấu nhận biết một tệp có đổi nội dung hay không, lấy từ đầu phản hồi */
function tagOf(res){
  if (!res) return '';
  const h = res.headers;
  return h.get('etag') || h.get('last-modified') || h.get('content-length') || '';
}
/* So bản cũ với bản mới. Ưu tiên ETag cho nhanh, nhưng không phải máy chủ
   nào cũng gửi (và vài dịch vụ trung gian còn cắt mất) — thiếu thì so thẳng
   nội dung. Các tệp ở đây đều nhỏ nên so nội dung không tốn gì đáng kể. */
async function hasChanged(hit, res){
  if (!hit) return false;
  const a = tagOf(hit), b = tagOf(res);
  if (a && b) return a !== b;
  try { return (await hit.clone().text()) !== (await res.clone().text()); }
  catch(_){ return false; }
}
async function tellClients(msg){
  const list = await self.clients.matchAll({type:'window'});
  list.forEach(c => c.postMessage(msg));
}

/* Tải bản mới về, lưu lại, và báo cho trang nếu nội dung đã khác. */
async function fetchAndUpdate(req){
  let res;
  /* Hỏi thẳng máy chủ, đừng lấy từ bộ nhớ đệm HTTP của trình duyệt. Không có
     chỗ này thì hai lớp đệm chồng lên nhau: trình duyệt đưa bản cũ cho service
     worker, service worker đem bản cũ so với bản cũ rồi kết luận "không có gì
     mới" — app kẹt ở bản cũ mà chẳng ai báo. Cửa sổ ẩn danh không dính vì nó
     bắt đầu với đệm rỗng, nên nhìn vào tưởng máy chủ có vấn đề.
     no-cache chứ không phải reload: vẫn hỏi lại mỗi lần, nhưng nội dung không
     đổi thì máy chủ trả 304 rỗng, không tải lại cả tệp. */
  try { res = await fetch(req.url, {cache:'no-cache', credentials:'same-origin'}); }
  catch(_){ return null; }
  if (!res || !res.ok || res.status !== 200) return res || null;

  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const changed = await hasChanged(hit, res);
  await cache.put(req, res.clone()).catch(() => {});
  if (changed) await tellClients({type:'lifehub-update'});
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch(_){ return; }

  /* Chỉ lo phần tĩnh của chính trang này. Không đụng vào api/ (đăng nhập,
     đồng bộ, cron) — dữ liệu ở đó không bao giờ được lấy từ bộ nhớ đệm. */
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;

  /* Trang chính: ưu tiên mạng để vào là thấy bản mới nhất,
     mất mạng thì lấy bản đã lưu. */
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(res => {
          const c = res.clone();
          caches.open(CACHE).then(k => k.put(req, c)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* Có tham số trên URL nghĩa là bên gọi cố tình muốn hỏi thẳng máy chủ —
     Cài đặt → Phiên bản làm đúng vậy để soi chính bộ nhớ đệm này. Cho đi
     thẳng, đừng đệm: mỗi lần hỏi lại là một khoá mới, đệm lại thì mỗi lần
     mở Cài đặt là kho phình thêm một bản state.js nữa. */
  if (url.search) return;

  /* Dùng bản đã lưu trước cho nhanh, tải bản mới ngầm ở phía sau.

     waitUntil phải gọi ĐỒNG BỘ ngay đây. Không có nó, trình duyệt coi
     như xong việc ngay khi trả bản cũ và có quyền dừng service worker
     giữa chừng — bản mới không bao giờ được lưu, app cứ hiện mãi giao
     diện cũ dù máy chủ đã có code mới. */
  const fresh = fetchAndUpdate(req);
  e.waitUntil(fresh);
  e.respondWith(
    caches.match(req).then(hit => hit || fresh.then(r => r || Response.error()))
  );
});

/* Trang bấm "tải lại ngay" → bỏ hết bộ nhớ đệm rồi nhận lại từ máy chủ */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'lifehub-refresh'){
    e.waitUntil(caches.delete(CACHE).then(() => self.skipWaiting()));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
