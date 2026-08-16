/* ============================================================
   sync.js — đồng bộ nhiều thiết bị

   Hai đường đi, tự chọn cái nào đang sẵn sàng:
     1. Máy chủ của bạn (thư mục api/ trên Hostinger) — mặc định
     2. Supabase — giữ lại cho ai đã trót cấu hình

   Mô hình chung: mỗi bản ghi là một dòng, trộn theo updatedAt,
   ai mới hơn thì thắng. Không có đường nào thì app vẫn chạy 100%
   offline như thường.
   ============================================================ */
"use strict";

const Sync = (() => {
  let timer = null, pushTimer = null;
  let state = 'off';           // off | idle | syncing | error
  let lastError = '';
  const listeners = [];

  const cfg = () => db.settings;
  const supaOn = () => !!(cfg().supabaseUrl && cfg().supabaseKey && cfg().workspace);
  const srvOn  = () => !!(window.Server && Server.authed());

  const mode = () => srvOn() ? 'server' : supaOn() ? 'supabase' : 'off';
  const on   = () => mode() !== 'off';

  function setState(s, err){
    state = s; lastError = err || '';
    listeners.forEach(f => { try { f(state, lastError); } catch(e){} });
  }
  function onChange(f){ listeners.push(f); }
  function status(){
    return {state, lastError, on:on(), mode:mode(),
            workspace: mode() === 'server' ? 'máy chủ của bạn' : cfg().workspace};
  }

  /* ---- gom bản ghi local thành dòng ---- */
  function localRows(sinceISO){
    const rows = [];
    COLLECTIONS.forEach(kind => {
      db[kind].forEach(rec => {
        if (sinceISO && rec.updatedAt <= sinceISO) return;
        rows.push({kind, item_id:rec.id, data:rec, updated_at:rec.updatedAt, deleted:!!rec.deleted});
      });
    });
    return rows;
  }
  /* ---- nhận một dòng từ xa vào kho local ---- */
  function absorb(row){
    if (!COLLECTIONS.includes(row.kind)) return 0;
    const arr = db[row.kind];
    const i = arr.findIndex(x => x.id === row.item_id);
    const remote = Object.assign({}, row.data, {
      id: row.item_id, updatedAt: row.updated_at, deleted: !!row.deleted
    });
    if (i < 0){ arr.push(remote); return 1; }
    if ((arr[i].updatedAt || '') < remote.updatedAt){ arr[i] = remote; return 1; }
    return 0;
  }

  /* ============ đường 1: máy chủ của bạn ============ */
  async function srvPush(){
    const since = db.meta.srvPush || '';
    const rows = localRows(since);
    if (!rows.length) return 0;
    /* chia lô để không vượt giới hạn kích thước yêu cầu */
    for (let i = 0; i < rows.length; i += 400){
      await Server.push(rows.slice(i, i + 400));
    }
    db.meta.srvPush = rows.reduce((m,r) => r.updated_at > m ? r.updated_at : m, since);
    return rows.length;
  }
  async function srvPull(){
    let cursor = db.meta.srvPull || '';
    let changed = 0, guard = 0;
    while (guard++ < 200){
      const d = await Server.pull(cursor);
      d.rows.forEach(r => { changed += absorb(r); });
      if (d.rows.length){
        const max = d.rows.reduce((m,r) => r.updated_at > m ? r.updated_at : m, cursor);
        if (max === cursor && !d.more) break;      // không tiến thêm được nữa
        cursor = max;
      }
      if (!d.more) break;
    }
    db.meta.srvPull = cursor;
    db.meta.lastPull = now();
    return changed;
  }

  /* ============ đường 2: Supabase ============ */
  function headers(extra){
    return Object.assign({
      'apikey': cfg().supabaseKey,
      'Authorization': 'Bearer ' + cfg().supabaseKey,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  const endpoint = () => cfg().supabaseUrl.replace(/\/+$/,'') + '/rest/v1/lifehub_items';
  async function req(url, opts){
    try { return await fetch(url, opts); }
    catch(e){ throw new Error('Không kết nối được — kiểm tra đường truyền'); }
  }
  async function supaPush(){
    const since = db.meta.lastPush || null;
    const rows = localRows(since).map(r => Object.assign({workspace: cfg().workspace}, r));
    if (!rows.length) return 0;
    const res = await req(endpoint(), {
      method:'POST',
      headers: headers({'Prefer':'resolution=merge-duplicates,return=minimal'}),
      body: JSON.stringify(rows)
    });
    if (!res.ok) throw new Error('Đẩy dữ liệu lỗi ' + res.status + ': ' + (await res.text()).slice(0,140));
    db.meta.lastPush = rows.reduce((m,r) => r.updated_at > m ? r.updated_at : m, since || '');
    return rows.length;
  }
  /* Supabase chỉ trả tối đa 1000 dòng mỗi lượt → phải lấy theo trang */
  const PAGE = 1000;
  async function supaPull(){
    let changed = 0;
    for (let off = 0, guard = 0; guard < 100; guard++, off += PAGE){
      const url = endpoint() + '?workspace=eq.' + encodeURIComponent(cfg().workspace)
                + '&select=kind,item_id,data,updated_at,deleted'
                + '&order=updated_at.asc&limit=' + PAGE + '&offset=' + off;
      const res = await req(url, {headers: headers()});
      if (!res.ok) throw new Error('Tải dữ liệu lỗi ' + res.status + ': ' + (await res.text()).slice(0,140));
      const page = await res.json();
      page.forEach(r => { changed += absorb(r); });
      if (page.length < PAGE) break;
    }
    db.meta.lastPull = now();
    return changed;
  }

  /* ============ điều phối ============ */
  async function run(silent){
    const m = mode();
    if (m === 'off' || state === 'syncing') return;
    setState('syncing');
    try {
      let changed;
      if (m === 'server'){ await srvPush(); changed = await srvPull(); }
      else               { await supaPush(); changed = await supaPull(); }
      if (changed) ensure();
      persist();
      setState('idle');
      if (changed && window.render) render();
      if (!silent) toast(changed ? 'Đã đồng bộ · ' + changed + ' thay đổi' : 'Đã đồng bộ');
    } catch(e){
      setState('error', e.message || String(e));
      if (!silent) toast('Lỗi đồng bộ: ' + (e.message || e));
    }
  }

  /* save() gọi vào đây → đẩy sau 2.5s để gom nhiều thay đổi liên tiếp */
  function markDirty(){
    if (!on()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => run(true), 2500);
  }

  /* Đẩy dứt điểm ngay trước khi app xuống nền hoặc trang đóng.
     Không gọi thẳng run() được: nếu đang có lượt đồng bộ chạy dở thì
     run() thoát ngay lập tức, mà timer 45s và debounce 2.5s đều bị
     trình duyệt di động treo khi app xuống nền — thay đổi vừa gõ sẽ
     kẹt lại trên máy, cron không thấy gì để gửi.
     sendBeacon giao gói tin cho trình duyệt gửi tiếp kể cả sau khi
     trang đã đóng, nên đây là đường duy nhất chắc chắn đi được. */
  function flush(){
    if (!on()) return;
    if (mode() !== 'server'){ run(true); return; }
    const rows = localRows(db.meta.srvPush || '');
    if (!rows.length) return;
    let sent = false;
    try {
      if (navigator.sendBeacon){
        const blob = new Blob([JSON.stringify({action:'push', rows})], {type:'application/json'});
        sent = navigator.sendBeacon(Server.url(), blob);
      }
    } catch(e){}
    /* Cố ý KHÔNG dời mốc srvPush: beacon không trả lời nên không dám
       coi là đã lưu xong. Lượt đồng bộ sau đẩy lại, máy chủ so
       updated_at rồi bỏ qua bản trùng — thừa một lượt, không sai dữ liệu. */
    if (!sent) run(true);
  }

  /* start() được gọi lại mỗi lần đổi cấu hình, nên chỉ gắn sự kiện một lần */
  let hooked = false;
  function start(){
    clearInterval(timer);
    if (!on()){ setState('off'); return; }
    setState('idle');
    run(true);
    timer = setInterval(() => run(true), 45000);
    if (!hooked){
      hooked = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flush();
        else if (on()) run(true);
      });
      window.addEventListener('pagehide', flush);
      window.addEventListener('online', () => { if (on()) run(true); });
    }
  }

  /* kiểm tra cấu hình Supabase */
  async function test(){
    if (!supaOn()) throw new Error('Chưa nhập đủ URL, khoá và tên không gian');
    const res = await req(endpoint() + '?select=item_id&limit=1', {headers: headers()});
    if (res.status === 404 || res.status === 400)
      throw new Error('Chưa có bảng lifehub_items — hãy chạy file supabase-schema.sql trong SQL Editor');
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0,140));
    return true;
  }

  /* Máy này vừa đăng nhập lần đầu: quên mốc cũ để kéo lại từ đầu */
  function resetCursor(){
    db.meta.srvPull = ''; db.meta.srvPush = '';
    db.meta.lastPull = null; db.meta.lastPush = null;
  }

  return {start, run, markDirty, status, onChange, test, on, mode, resetCursor};
})();
window.Sync = Sync;
