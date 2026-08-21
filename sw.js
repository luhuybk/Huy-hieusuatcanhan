/* ============================================================
   Service worker — cài như app, chạy offline, hiện thông báo.
   Chỉ hoạt động qua http/https (không chạy với file://).

   Luật ở đây rất đơn giản, và cố tình đơn giản:

   · Code của app (html, css, js) → HỎI MÁY CHỦ TRƯỚC. Mất mạng mới
     lấy bản đã lưu. Nghĩa là mở app ra lúc nào cũng là code mới nhất,
     và bấm tải lại thì không đời nào tụt về bản cũ được.
   · Ảnh, icon, manifest → lấy bản đã lưu cho nhanh, tải mới ngầm phía sau.
     Mấy tệp này gần như không bao giờ đổi nên chậm một nhịp cũng không sao.

   Bản trước làm ngược lại: code cũng lấy từ bộ nhớ đệm trước. Vào app là
   chạy code của lần trước, tải bản mới về để dành cho lần sau, rồi mời
   bạn tải lại — mà lần tải lại đó lại rơi đúng vào bản đang nằm trong đệm.
   Mở ra thấy bản mới, bấm "Tải lại", quay về bản cũ. Đúng như đã gặp.
   ============================================================ */

/* Đổi tên là cả kho đệm cũ bị dọn sạch ở bước activate — cách chắc chắn
   nhất để những tệp kẹt lại từ bản trước biến mất hẳn khỏi máy. */
const CACHE = 'lifehub-2';

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

/* Code của app — thứ phải luôn mới. Mọi thứ còn lại coi là tài nguyên tĩnh. */
const isCode = p => p === '/' || p.endsWith('/') ||
  /\.(html|css|js|webmanifest)$/.test(p);

/* Hỏi thẳng máy chủ, đừng lấy từ bộ nhớ đệm HTTP của trình duyệt: không có
   chỗ này thì hai lớp đệm chồng lên nhau và cả hai cùng giữ bản cũ.
   no-cache chứ không phải reload — vẫn hỏi lại mỗi lần, nhưng nội dung không
   đổi thì máy chủ trả 304 rỗng, không tải lại cả tệp. */
const ask = url => fetch(url, {cache:'no-cache', credentials:'same-origin'});

function keep(req, res){
  if (!res || !res.ok || res.status !== 200) return;
  const c = res.clone();
  caches.open(CACHE).then(k => k.put(req, c)).catch(() => {});
}

/* Máy chủ trước, bộ nhớ đệm chỉ để dành cho lúc mất mạng. */
async function netFirst(req){
  try {
    const res = await ask(req.url);
    keep(req, res);
    return res;
  } catch(_){
    const nav = req.mode === 'navigate';
    const hit = await caches.match(req, {ignoreSearch: nav});
    if (hit) return hit;
    if (nav){
      const idx = await caches.match('./index.html');
      if (idx) return idx;
    }
    return Response.error();
  }
}

/* Tài nguyên tĩnh: đưa bản đã lưu ra ngay, đồng thời làm mới cho lần sau. */
async function fetchAndStore(req){
  let res;
  try { res = await ask(req.url); } catch(_){ return null; }
  keep(req, res);
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

  /* Có tham số trên URL nghĩa là bên gọi cố tình muốn hỏi thẳng máy chủ —
     Cài đặt → Phiên bản làm đúng vậy để soi chính bộ nhớ đệm này. Cho đi
     thẳng, đừng đệm: mỗi lần hỏi lại là một khoá mới, đệm lại thì mỗi lần
     mở Cài đặt là kho phình thêm một bản state.js nữa.
     Trừ lúc mở trang: ?fresh=… của "Gỡ sạch & tải lại" vẫn là một lần vào
     app bình thường, và nó vẫn cần lối lui khi mất mạng. */
  if (url.search && req.mode !== 'navigate') return;

  if (req.mode === 'navigate' || isCode(url.pathname)){
    e.respondWith(netFirst(req));
    return;
  }

  /* waitUntil phải gọi ĐỒNG BỘ ngay đây. Không có nó, trình duyệt coi như
     xong việc ngay khi trả bản cũ và có quyền dừng service worker giữa
     chừng — bản mới không bao giờ được lưu. */
  const fresh = fetchAndStore(req);
  e.waitUntil(fresh);
  e.respondWith(
    caches.match(req).then(hit => hit || fresh.then(r => r || Response.error()))
  );
});

/* Trang bấm "tải lại ngay" → bỏ hết bộ nhớ đệm, rồi BÁO LẠI cho trang.
   Phải báo lại: trước đây trang chỉ đợi bừa một phần năm giây rồi tải lại,
   máy chậm hơn chừng đó là lần tải kế tiếp vẫn gặp nguyên bộ đệm cũ. */
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'lifehub-refresh') return;
  const reply = () => { const p = e.ports && e.ports[0]; if (p) p.postMessage({ok:true}); };
  e.waitUntil(caches.delete(CACHE).then(reply, reply).then(() => self.skipWaiting()));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
