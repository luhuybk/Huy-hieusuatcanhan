/* ============================================================
   sync.js — đồng bộ nhiều thiết bị qua Supabase (REST, không cần SDK)
   Mô hình: mỗi bản ghi là một dòng. Trộn theo updatedAt, ai mới hơn thì thắng.
   Không cấu hình gì thì app vẫn chạy bình thường 100% offline.
   ============================================================ */
"use strict";

const Sync = (() => {
  let timer = null, pushTimer = null;
  let state = 'off';           // off | idle | syncing | error
  let lastError = '';
  const listeners = [];

  const cfg = () => db.settings;
  const on  = () => !!(cfg().supabaseUrl && cfg().supabaseKey && cfg().workspace);

  function setState(s, err){
    state = s; lastError = err || '';
    listeners.forEach(f => { try { f(state, lastError); } catch(e){} });
  }
  function onChange(f){ listeners.push(f); }
  function status(){ return {state, lastError, on:on(), workspace:cfg().workspace}; }

  function headers(extra){
    return Object.assign({
      'apikey': cfg().supabaseKey,
      'Authorization': 'Bearer ' + cfg().supabaseKey,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  const endpoint = () => cfg().supabaseUrl.replace(/\/+$/,'') + '/rest/v1/lifehub_items';

  /* fetch nhưng đổi lỗi mạng thành câu tiếng Việt dễ hiểu */
  async function req(url, opts){
    try { return await fetch(url, opts); }
    catch(e){ throw new Error('Không kết nối được tới Supabase — kiểm tra URL và mạng'); }
  }

  /* ---- gom toàn bộ bản ghi local thành dòng ---- */
  function localRows(sinceISO){
    const rows = [];
    COLLECTIONS.forEach(kind => {
      db[kind].forEach(rec => {
        if (sinceISO && rec.updatedAt <= sinceISO) return;
        rows.push({
          workspace: cfg().workspace,
          kind: kind,
          item_id: rec.id,
          data: rec,
          updated_at: rec.updatedAt,
          deleted: !!rec.deleted
        });
      });
    });
    return rows;
  }

  /* ---- đẩy lên ---- */
  async function push(){
    const since = db.meta.lastPush || null;
    const rows = localRows(since);
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

  /* ---- kéo về ----
     Supabase chỉ trả tối đa 1000 dòng mỗi lượt. Phải lấy theo trang,
     nếu không thì khi dữ liệu vượt 1000 bản ghi phần dư sẽ âm thầm mất. */
  const PAGE = 1000;
  async function pullPage(offset){
    const url = endpoint() + '?workspace=eq.' + encodeURIComponent(cfg().workspace)
              + '&select=kind,item_id,data,updated_at,deleted'
              + '&order=updated_at.asc&limit=' + PAGE + '&offset=' + offset;
    const res = await req(url, {headers: headers()});
    if (!res.ok) throw new Error('Tải dữ liệu lỗi ' + res.status + ': ' + (await res.text()).slice(0,140));
    return res.json();
  }
  async function pull(){
    const rows = [];
    for (let off = 0, guard = 0; guard < 100; guard++, off += PAGE){
      const page = await pullPage(off);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    let changed = 0;
    for (const row of rows){
      if (!COLLECTIONS.includes(row.kind)) continue;
      const arr = db[row.kind];
      const i = arr.findIndex(x => x.id === row.item_id);
      const remote = Object.assign({}, row.data, {
        id: row.item_id, updatedAt: row.updated_at, deleted: !!row.deleted
      });
      if (i < 0){ arr.push(remote); changed++; }
      else if ((arr[i].updatedAt || '') < remote.updatedAt){ arr[i] = remote; changed++; }
    }
    if (changed){
      ensure();
      persist();      // lưu thẳng, không qua save() để khỏi đánh dấu dirty lại
    }
    db.meta.lastPull = now();
    return changed;
  }

  async function run(silent){
    if (!on() || state === 'syncing') return;
    setState('syncing');
    try {
      await push();
      const changed = await pull();
      persist();
      setState('idle');
      if (changed && window.render) render();
      if (!silent && changed) toast('Đã đồng bộ · ' + changed + ' thay đổi');
      else if (!silent) toast('Đã đồng bộ');
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

  /* start() được gọi lại mỗi lần lưu cấu hình, nên chỉ gắn một lần */
  let hooked = false;
  function start(){
    clearInterval(timer);
    if (!on()){ setState('off'); return; }
    setState('idle');
    run(true);
    timer = setInterval(() => run(true), 45000);
    if (!hooked){
      hooked = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden && on()) run(true); });
    }
  }

  /* kiểm tra kết nối + tạo bảng chưa? */
  async function test(){
    if (!on()) throw new Error('Chưa nhập đủ URL, khoá và tên không gian');
    const res = await req(endpoint() + '?select=item_id&limit=1', {headers: headers()});
    if (res.status === 404 || res.status === 400)
      throw new Error('Chưa có bảng lifehub_items — hãy chạy file supabase-schema.sql trong SQL Editor');
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0,140));
    return true;
  }

  return {start, run, push, pull, markDirty, status, onChange, test, on};
})();
window.Sync = Sync;
