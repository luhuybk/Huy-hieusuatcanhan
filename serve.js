/* Máy chủ chạy thử trên máy — CHỈ dùng khi phát triển, không đưa lên hosting.

   Phục vụ thẳng thư mục gốc của dự án (chính là thứ chạy thật trên máy chủ),
   và giả lập api/index.php bằng Node để thử đăng nhập, đồng bộ và lịch nhắc
   mà không cần cài PHP. Phần giả lập viết lại đúng logic của bản PHP.

     node serve.js      → http://localhost:5199

   Cần api/config.php (chép từ config.example.php, dán mã của
   "node tools/hash-password.js" vào) thì phần đăng nhập mới chạy.        */
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = __dirname;          // gốc repo = thư mục chạy thật
const PORT = process.env.PORT || 5199;
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.png':'image/png', '.txt':'text/plain; charset=utf-8',
  '.sql':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8'
};

/* ---------------- cấu hình: đọc thẳng từ api/config.php ---------------- */
function loadPassword(){
  const f = path.join(__dirname, 'api/config.php');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/define\(\s*'LH_PASSWORD'\s*,\s*'([^']+)'\s*\)/);
  return m && !m[1].includes('DAN_MA_VAO_DAY') ? m[1] : null;
}
const LH_PASSWORD = loadPassword();

/* ---------------- kho dữ liệu ---------------- */
let store = null;
function db(){
  if (store) return store;
  const {DatabaseSync} = require('node:sqlite');
  const dir = path.join(__dirname, 'api/data');
  fs.mkdirSync(dir, {recursive:true});
  store = new DatabaseSync(path.join(dir, 'dev.sqlite'));
  store.exec(`CREATE TABLE IF NOT EXISTS items (
      kind TEXT NOT NULL, item_id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, item_id));
    CREATE INDEX IF NOT EXISTS items_upd ON items(updated_at);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, created_at TEXT, expires_at TEXT, label TEXT);
    CREATE TABLE IF NOT EXISTS login_fails (ip TEXT, at INTEGER);
    CREATE TABLE IF NOT EXISTS conf (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS sent (k TEXT PRIMARY KEY, at INTEGER);`);
  return store;
}

/* ---------------- cấu hình Telegram + bộ hẹn giờ ----------------
   Viết lại đúng logic của api/lib.php để thử được lịch chạy trên máy.  */
const confGet = (k, d) => { const r = db().prepare('SELECT v FROM conf WHERE k = ?').get(k);
                            return r === undefined ? d : r.v; };
const confSet = (k, v) => db().prepare(
  'INSERT INTO conf (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v));

function itemsOf(kind){
  return db().prepare('SELECT data FROM items WHERE kind = ? AND deleted = 0').all(kind)
    .map(r => { try { return JSON.parse(r.data); } catch(e){ return null; } })
    .filter(d => d && !d.deleted);
}
const REM_WINDOW = 3600;
const ESCALATE_DAYS = [3, 7, 14, 30];
const TIER_PING = {S:14, S2:21, A:30, B:60, C:150};
const SNOOZE_MINS = {240:'4 giờ', 720:'12 giờ', 1440:'1 ngày', 4320:'3 ngày'};
const pad = n => String(n).padStart(2,'0');

/* bản song sinh của topicFor() bên PHP */
const TOPIC_CONF = {tasks:'tg_task_topic', cards:'tg_card_topic',
                    rem:'tg_rem_topic',    report:'tg_report_topic'};
function topicFor(what){
  const v = String(confGet(TOPIC_CONF[what] || '', '') || '').trim();
  if (v) return v;
  if (what !== 'rem'){
    const old = String(confGet('tg_work_topic', '') || '').trim();
    if (old) return old;
  }
  return String(confGet('tg_topic', '') || '') || 'chính';
}
/* Bố cục nút dưới tin nhắc — bản song sinh của tgItemButtons() bên PHP.
   Ở đây không gọi Telegram thật, nhưng vẫn dựng đúng hình dạng bàn phím để
   kiểm được số hàng và số nút mỗi hàng: bốn nút một hàng thì trên điện
   thoại nhãn bị bóp xuống dòng, đúng lỗi đã gặp. */
function tgItemButtons(kind, id){
  if (!confGet('tg_webhook_on')) return null;
  const rows = [[{text:'✅ Xong', callback_data:`done:${kind}:${id}`}]];
  const mins = Object.keys(SNOOZE_MINS);
  for (let i = 0; i < mins.length; i += 2)
    rows.push(mins.slice(i, i + 2).map(m =>
      ({text:`⏰ ${SNOOZE_MINS[m]}`, callback_data:`snz:${kind}:${id}:${m}`})));
  return rows;
}

/* việc lặp lại — bản song sinh của stepRepeat()/nextRepeat() bên PHP,
   vốn lại là bản song sinh của js/state.js. Ba nơi phải ra cùng một ngày. */
const isRepeat = c => /^[dwmy]\d+$/.test(String(c || ''));
function stepRepeat(iso, code){
  const unit = code[0], n = Math.max(1, +code.slice(1) || 1);
  const d = new Date(iso + 'T00:00:00');
  if (unit === 'd'){ d.setDate(d.getDate() + n); }
  else if (unit === 'w'){ d.setDate(d.getDate() + 7 * n); }
  else {
    const day = d.getDate();
    d.setMonth(d.getMonth() + (unit === 'm' ? n : 12 * n));
    if (d.getDate() < day) d.setDate(0);      // 31/1 + 1 tháng → 28/2
  }
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function nextRepeat(iso, code){
  if (!isRepeat(code)) return '';
  const t = today_();
  let base = iso || t, guard = 0;
  do { base = stepRepeat(base, code); } while (base < t && ++guard < 400);
  return base;
}

/* mốc dời nhắc → giây, 0 khi không có; bản song sinh của snoozeAt() bên PHP */
function snoozeAt(t){
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(t.snoozeUntil || '').trim());
  return m ? Math.floor(new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime()/1000) : 0;
}

function buildDigest(){
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const md = today.slice(5);
  const lines = [];

  const workOn = +confGet('tg_work_hour','-1') >= 0;
  const due = workOn ? []
    : itemsOf('tasks').filter(t => !t.done && t.due && String(t.due).slice(0,10) <= today);
  if (due.length){
    const late = due.filter(t => String(t.due).slice(0,10) < today).length;
    lines.push(`✓ ${due.length} việc đến hạn${late ? ` (${late} đã trễ)` : ''}`);
    due.slice(0,6).forEach(t => lines.push('   • ' + (t.title || '')));
  }

  const bdToday = [], bdSoon = [];
  for (const [kind, tag] of [['people',''], ['staff',' (nhân viên)']]){
    for (const p of itemsOf(kind)){
      const b = String(p.birthday || ''); if (b.length < 10) continue;
      const pmd = b.slice(5,10);
      if (pmd === md){ bdToday.push((p.name||'') + tag); continue; }
      for (let i = 1; i <= 7; i++){
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+i);
        if (pmd === `${pad(d.getMonth()+1)}-${pad(d.getDate())}`){
          bdSoon.push(`${p.name||''}${tag} (${i} ngày nữa)`); break;
        }
      }
    }
  }
  if (bdToday.length) lines.push('🎂 Hôm nay sinh nhật: ' + bdToday.join(', '));
  if (bdSoon.length)  lines.push('🎁 Sắp sinh nhật: ' + bdSoon.join(', '));

  for (const o of itemsOf('occasions')){
    const isoD = String(o.nextIso || '').slice(0,10); if (isoD.length < 10) continue;
    const d = Math.round((new Date(isoD+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
    const remind = o.remind == null ? 7 : +o.remind;
    if (d >= 0 && d <= remind)
      lines.push(`🎊 ${o.title||''}: ${d === 0 ? 'hôm nay' : 'còn ' + d + ' ngày'}`);
  }

  let lateCards = 0, owed = 0, owedN = 0;
  for (const c of itemsOf('cards')){
    if (c.col !== 'done' && c.due && String(c.due).slice(0,10) < today) lateCards++;
    if (c.extra && !c.extraPaidDate){ owed += +(c.extraPay || 0); owedN++; }
  }
  if (lateCards && !workOn) lines.push(`⚠️ ${lateCards} việc đã giao đang trễ`);
  if (owed) lines.push(`💰 Còn nợ công ngoài luồng: ${owed.toLocaleString('vi-VN')}₫ (${owedN} việc)`);
  return lines;
}

/* bảng công việc — bản song sinh của buildWork() bên PHP */
function buildWork(atMs){
  const now = atMs ? new Date(atMs) : new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const dayOf = iso => Math.round((new Date(iso+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000);
  const cut = (s, n) => { s = String(s || '').trim(); n = n || 60;
                          return s.length > n ? s.slice(0, n-1) + '…' : s; };
  const lines = [];

  const late = [], now_ = [], soon = [];
  for (const t of itemsOf('tasks')){
    if (t.done) continue;
    const due = String(t.due || '').slice(0,10); if (due.length < 10) continue;
    const d = dayOf(due);
    if (d < 0) late.push(t); else if (d === 0) now_.push(t); else if (d <= 3) soon.push([t, d]);
  }
  const mark = t => '   • ' + cut(t.title) + (t.prio === 'high' ? ' ❗' : '')
                  + (t.remindAt ? ` (${t.remindAt})` : '');
  if (late.length){
    late.sort((a,b) => String(a.due).localeCompare(String(b.due)));
    lines.push(`🔴 Trễ hạn (${late.length})`);
    late.slice(0,8).forEach(t => lines.push(mark(t) + ` — trễ ${-dayOf(String(t.due).slice(0,10))} ngày`));
    if (late.length > 8) lines.push(`   … và ${late.length - 8} việc nữa`);
  }
  if (now_.length){
    lines.push((lines.length ? '\n' : '') + `📌 Hôm nay (${now_.length})`);
    now_.slice(0,10).forEach(t => lines.push(mark(t)));
    if (now_.length > 10) lines.push(`   … và ${now_.length - 10} việc nữa`);
  }
  if (soon.length){
    soon.sort((a,b) => a[1] - b[1]);
    lines.push((lines.length ? '\n' : '') + '🗓 Vài ngày tới');
    soon.slice(0,5).forEach(s => lines.push(`   • ${cut(s[0].title)} — còn ${s[1]} ngày`));
  }

  const cLate = [], cToday = [];
  for (const c of itemsOf('cards')){
    if (c.col === 'done') continue;
    const due = String(c.due || '').slice(0,10); if (due.length < 10) continue;
    const d = dayOf(due);
    if (d < 0) cLate.push(c); else if (d === 0) cToday.push(c);
  }
  const who = c => '   • ' + cut(c.title) + (c.prio === 'high' ? ' ❗' : '')
    + (String(c.assignee || '').trim() ? ' — ' + c.assignee : ' — chưa giao')
    + (c.remindAt ? ` (${c.remindAt})` : '');
  if (cLate.length || cToday.length){
    lines.push((lines.length ? '\n' : '') + '👥 Việc đã giao');
    cLate.slice(0,6).forEach(c => lines.push(who(c) + ` (trễ ${-dayOf(String(c.due).slice(0,10))} ngày)`));
    cToday.slice(0,6).forEach(c => lines.push(who(c) + ' (hạn hôm nay)'));
  }
  return lines;
}

/* tóm tắt cuối tuần — bản song sinh của buildWeekly() bên PHP */
function buildWeekly(atMs){
  const now = atMs ? new Date(atMs) : new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const fromD = new Date(now); fromD.setDate(fromD.getDate() - 7);
  const from = `${fromD.getFullYear()}-${pad(fromD.getMonth()+1)}-${pad(fromD.getDate())}`;
  const lines = [];

  let doneCount = 0;
  for (const t of itemsOf('tasks')){
    if (t.repeat) (t.doneLog || []).forEach(d => { if (String(d) >= from) doneCount++; });
    else if (t.done && String(t.doneAt || '') >= from) doneCount++;
  }
  let cardsDone = 0;
  for (const c of itemsOf('cards')) if (c.col === 'done' && String(c.doneAt || '') >= from) cardsDone++;

  const lateTasks = itemsOf('tasks').filter(t => !t.done && t.due && String(t.due).slice(0,10) < today);

  let touched = 0;
  for (const p of itemsOf('people')) if (p.lastContact && String(p.lastContact) >= from) touched++;

  lines.push(`✓ ${doneCount} việc xong`);
  lines.push(`📇 ${cardsDone} thẻ giao xong`);
  lines.push(`☎️ ${touched} người đã hỏi thăm`);

  const sep = () => lines.push('', '─────────────', '');

  if (lateTasks.length){
    sep();
    lines.push(`⚠️ Đang trễ — dời hay bỏ? (${lateTasks.length})`);
    lateTasks.slice(0,6).forEach(t => lines.push('   • ' + t.title));
    if (lateTasks.length > 6) lines.push(`   … và ${lateTasks.length - 6} việc nữa`);
  }

  const forgotten = [];
  for (const p of itemsOf('people')){
    const gap = p.lastContact ? Math.round((new Date(today+'T00:00:00') - new Date(String(p.lastContact)+'T00:00:00')) / 86400000) : 9999;
    const over = gap - (TIER_PING[p.tier] || 60);
    if (over > 0) forgotten.push([p, over]);
  }
  if (forgotten.length){
    forgotten.sort((a,b) => b[1] - a[1]);
    sep();
    lines.push('🙈 Lâu rồi chưa hỏi thăm');
    forgotten.slice(0,5).forEach(f => lines.push(`   • ${f[0].name || ''} — trễ ${f[1]} ngày`));
  }

  let owed = 0, owedN = 0;
  for (const c of itemsOf('cards')) if (c.extra && !c.extraPaidDate){ owed += +(c.extraPay || 0); owedN++; }
  if (owed){ sep(); lines.push(`💰 Còn nợ công ngoài luồng: ${owed.toLocaleString('vi-VN')}₫ (${owedN} việc)`); }

  return lines;
}

const alreadySent = k => !!db().prepare('SELECT 1 FROM sent WHERE k = ?').get(k);
const markSent = k => db().prepare('INSERT OR IGNORE INTO sent (k,at) VALUES (?,?)').run(k, Math.floor(Date.now()/1000));

/* tổng kết tuần theo nhân sự — bản song sinh của buildStaffWeekly() bên PHP */
function buildStaffWeekly(atMs){
  const now = atMs ? new Date(atMs) : new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const f = new Date(now.getTime() - 7 * 86400000);
  const from = `${f.getFullYear()}-${pad(f.getMonth()+1)}-${pad(f.getDate())}`;
  const cut = s => { s = String(s || '').trim(); return s.length > 60 ? s.slice(0,59) + '…' : s; };
  const by = {};

  for (const c of itemsOf('cards')){
    const who = String(c.assignee || '').trim(); if (!who) continue;
    if (!by[who]) by[who] = {new:0, done:0, open:0, late:[], owed:0, owedN:0};
    if (String(c.createdAt || '').slice(0,10) >= from) by[who].new++;
    const isDone = c.col === 'done';
    if (isDone){ if (String(c.doneAt || '').slice(0,10) >= from) by[who].done++; }
    else {
      by[who].open++;
      const due = String(c.due || '').slice(0,10);
      if (due.length === 10 && due < today)
        by[who].late.push([c, Math.round((new Date(today+'T00:00:00') - new Date(due+'T00:00:00'))/86400000)]);
    }
    if (c.extra && !c.extraPaidDate){ by[who].owed += +(c.extraPay || 0); by[who].owedN++; }
  }

  const out = [];
  for (const name of Object.keys(by).sort((a,b) => a.localeCompare(b, 'vi'))){
    const r = by[name];
    if (!r.new && !r.done && !r.open && !r.owed) continue;
    const lines = [`📥 ${r.new} việc mới giao trong tuần`,
                   `✓ ${r.done} việc đã xong`,
                   `📋 ${r.open} việc còn đang mở`];
    if (r.late.length){
      r.late.sort((a,b) => b[1] - a[1]);
      lines.push('', '─────────────', '', `🔴 Đang trễ (${r.late.length})`);
      r.late.slice(0,6).forEach(l => lines.push(`   • ${cut(l[0].title)} — trễ ${l[1]} ngày`));
      if (r.late.length > 6) lines.push(`   … và ${r.late.length - 6} việc nữa`);
    }
    if (r.owed){
      lines.push('', '─────────────', '',
        `💰 Tiền công ngoài luồng chưa trả: ${r.owed.toLocaleString('vi-VN')}₫ (${r.owedN} việc)`);
    }
    out.push({name, lines});
  }
  return out;
}

/* vì sao lời nhắc chưa chạy — bản song sinh của tgWhy() bên PHP */
function tgWhy(atMs){
  const now = atMs ? new Date(atMs) : new Date();
  const nowSec = Math.floor(now.getTime()/1000);
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const items = [];

  for (const [kind, label] of [['tasks','Việc'], ['cards','Thẻ giao việc']]){
    for (const t of itemsOf(kind)){
      const at = String(t.remindAt || '').trim();
      const sn = String(t.snoozeUntil || '').trim();
      if (!at && !sn) continue;
      const due = String(t.due || '').slice(0,10);
      const row = {kind:label, title:t.title || '', at, due, snooze:sn, ok:false};
      const m = /^(\d{1,2}):(\d{2})$/.exec(at);
      const useSnooze = sn && (sn.slice(0,10) >= today || !at);

      if (kind === 'tasks' ? t.done : t.col === 'done') row.why = 'Đã đánh dấu xong — không nhắc nữa';
      else if (useSnooze){
        const when = snoozeAt(t);
        const key = `snz:${kind}:${t.id}:${sn}`;
        if (!when)                           row.why = 'Mốc dời không hợp lệ';
        else if (alreadySent(key))           row.why = 'Đã gửi lời nhắc dời rồi';
        else if (nowSec < when)              row.why = `Đã dời — còn ${Math.ceil((when-nowSec)/60)} phút`;
        else if (nowSec - when > REM_WINDOW) row.why = 'Quá 1 tiếng so với mốc dời — bỏ lần này';
        else { row.why = 'Sẽ gửi ở lần cron kế tiếp'; row.ok = true; }
      }
      else if (!m)          row.why = 'Giờ hẹn không hợp lệ';
      else if (!due)        row.why = 'Chưa đặt hạn — chỉ nhắc đúng ngày hạn';
      else if (due !== today && !(+(t.remindBefore || 0) > 0 && (() => {
                 const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + +t.remindBefore);
                 return due === `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
               })()))
        row.why = `Hạn ${due}, hôm nay không phải ngày nhắc`;
      else {
        const when = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2], 0).getTime()/1000);
        const key = `item:${kind}:${t.id}:${today}:${at}`;
        if (alreadySent(key))               row.why = 'Đã gửi rồi';
        else if (nowSec < when)             row.why = `Chưa tới giờ — còn ${Math.ceil((when-nowSec)/60)} phút`;
        else if (nowSec - when > REM_WINDOW) row.why = 'Quá 1 tiếng so với giờ hẹn — bỏ lần này';
        else { row.why = 'Sẽ gửi ở lần cron kế tiếp'; row.ok = true; }
      }
      items.push(row);
    }
  }

  const lastCron = confGet('last_cron', '');
  return {
    now: now.toLocaleString('vi-VN'),
    lastCron: lastCron === '' || lastCron == null ? null : Math.floor((Date.now()/1000 - +lastCron)/60),
    enabled: !!confGet('tg_enabled',''),
    hasToken: (confGet('tg_token','') || '') !== '',
    hasChat: (confGet('tg_chat','') || '') !== '',
    items,
  };
}

/* atMs: cho phép giả lập "bây giờ là mấy giờ" khi chạy thử */
function runSchedule(dry, atMs){
  const done = [];
  if (!dry) confSet('last_cron', String(Math.floor((atMs || Date.now())/1000)));
  if (!confGet('tg_enabled')) return {skipped:'Telegram đang tắt'};
  const now = atMs ? new Date(atMs) : new Date();
  const nowSec = Math.floor(now.getTime()/1000);
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const wday = now.getDay();

  for (const r of itemsOf('reminders')){
    if (!r.enabled) continue;
    if (!(r.days || []).map(Number).includes(wday)) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(r.time || '')); if (!m) continue;
    const at = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                                   +m[1], +m[2], 0).getTime() / 1000);
    if (nowSec < at || nowSec - at > REM_WINDOW) continue;
    const key = `rem:${r.id}:${today}`;
    if (alreadySent(key)) continue;
    /* đã tick xong hôm nay rồi thì đừng nhắc nữa */
    if ((r.doneLog || []).map(String).includes(today)) continue;
    if (dry){ done.push({reminder:r.title, dry:true}); continue; }
    markSent(key);
    done.push({reminder:r.title, ok:true, sent:`🔔 ${r.title}${r.note ? '\n'+r.note : ''}`,
               topic:String(r.topic || '').trim() || topicFor('rem')});
  }

  /* nhắc riêng từng đầu việc: đúng ngày hạn, và trước hạn nếu có đặt */
  const plusDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
                                 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  for (const [kind, icon, what] of [['tasks','✓','việc của mình'], ['cards','👥','việc đã giao']]){
    for (const t of itemsOf(kind)){
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(t.remindAt || '')); if (!m) continue;
      if (kind === 'tasks' ? t.done : t.col === 'done') continue;

      const due = String(t.due || '').slice(0,10); if (due.length < 10) continue;
      const before = +(t.remindBefore || 0);
      let lead;
      if (due === today)                                        lead = 0;
      else if (before > 0 && due === plusDays(today, before))    lead = before;
      else continue;

      /* đã bấm dời trong hôm nay thì bỏ giờ hẹn thường */
      const sn = String(t.snoozeUntil || '').trim().slice(0,10);
      if (sn && sn >= today) continue;
      const at = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                                     +m[1], +m[2], 0).getTime() / 1000);
      if (nowSec < at || nowSec - at > REM_WINDOW) continue;
      const key = `item:${kind}:${t.id}:${today}:${t.remindAt}`;
      if (alreadySent(key)) continue;
      if (dry){ done.push({[what]:t.title, dry:true}); continue; }
      markSent(key);
      done.push({[what]:t.title, ok:true, lead, topic:topicFor(kind),
                 buttons:tgItemButtons(kind, t.id)});
    }
  }

  /* việc đã bấm dời lại — chạy độc lập với ngày hạn */
  for (const [kind, what] of [['tasks','dời · việc của mình'], ['cards','dời · việc đã giao']]){
    for (const t of itemsOf(kind)){
      if (kind === 'tasks' ? t.done : t.col === 'done') continue;
      const when = snoozeAt(t);
      if (!when || nowSec < when || nowSec - when > REM_WINDOW) continue;
      const key = `snz:${kind}:${t.id}:${String(t.snoozeUntil).trim()}`;
      if (alreadySent(key)) continue;
      if (dry){ done.push({[what]:t.title, dry:true}); continue; }
      markSent(key);
      done.push({[what]:t.title, ok:true, topic:topicFor(kind)});
    }
  }

  /* báo trễ leo thang — chỉ một lần ở mỗi mốc ngày trễ */
  if (confGet('tg_escalate')){
    for (const [kind, what] of [['tasks','việc của mình'], ['cards','việc đã giao']]){
      for (const t of itemsOf(kind)){
        if (kind === 'tasks' ? t.done : t.col === 'done') continue;
        const due = String(t.due || '').slice(0,10); if (due.length < 10) continue;
        const daysLate = Math.floor((new Date(today+'T00:00:00') - new Date(due+'T00:00:00')) / 86400000);
        if (!ESCALATE_DAYS.includes(daysLate)) continue;
        const key = `esc:${kind}:${t.id}:${daysLate}`;
        if (alreadySent(key)) continue;
        if (dry){ done.push({escalate:t.title, days:daysLate, dry:true}); continue; }
        markSent(key);
        done.push({escalate:t.title, days:daysLate, ok:true, topic:topicFor(kind)});
      }
    }
  }

  /* tóm tắt cuối tuần — chỉ Chủ nhật */
  const weekH = +confGet('tg_weekly_hour', '-1');
  if (wday === 0 && weekH >= 0 && now.getHours() >= weekH){
    const key = 'weekly:' + today;
    if (!alreadySent(key)){
      const lines = buildWeekly(now.getTime());
      if (dry) done.push({weekly:lines.length, dry:true});
      else { markSent(key); done.push({weekly:lines.length, ok:true, lines, topic:topicFor('report')}); }
    }
    /* tổng kết theo từng nhân sự — mỗi người một tin, khoá riêng từng người */
    if (confGet('tg_staff_weekly')){
      for (const s of buildStaffWeekly(now.getTime())){
        const k = `staffw:${crypto.createHash('md5').update(s.name).digest('hex')}:${today}`;
        if (alreadySent(k)) continue;
        if (dry){ done.push({staff:s.name, dry:true}); continue; }
        markSent(k);
        done.push({staff:s.name, ok:true, lines:s.lines, topic:topicFor('cards')});
      }
    }
  }

  /* bảng công việc hằng ngày */
  const wh = +confGet('tg_work_hour', '-1');
  if (wh >= 0 && now.getHours() >= wh){
    const key = 'work:' + today;
    if (!alreadySent(key)){
      const lines = buildWork(now.getTime());
      if (lines.length){
        if (dry) done.push({work:lines.length, dry:true});
        else { markSent(key); done.push({work:lines.length, ok:true, lines, topic:topicFor('report')}); }
      } else { if (!dry) markSent(key); done.push({work:0, note:'không có việc nào cần nhắc'}); }
    }
  }

  const hour = +confGet('tg_digest_hour', '-1');
  if (hour >= 0 && now.getHours() >= hour){
    const key = 'digest:' + today;
    if (!alreadySent(key)){
      const lines = buildDigest();
      if (lines.length){
        if (dry) done.push({digest:lines.length, dry:true});
        else { markSent(key); done.push({digest:lines.length, ok:true, lines, topic:topicFor('report')}); }
      } else { if (!dry) markSent(key); done.push({digest:0, note:'không có gì cần nhắc'}); }
    }
  }
  return done;
}

/* ---------------- mật khẩu: giống hệt PHP ---------------- */
function checkPassword(given){
  if (!LH_PASSWORD) return false;
  const p = LH_PASSWORD.split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2_sha256') return false;
  const salt = Buffer.from(p[2], 'base64');
  const want = Buffer.from(p[3], 'base64');
  const got  = crypto.pbkdf2Sync(given, salt, parseInt(p[1], 10), want.length, 'sha256');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const PULL_LIMIT = 500, FAIL_MAX = 8, FAIL_WIN = 900, SESSION_DAY = 60;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const iso = (t) => new Date(t || Date.now()).toISOString();

function cookieOf(req, name){
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')){
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
function session(req){
  const tok = cookieOf(req, 'lh_session');
  if (!tok) return null;
  const row = db().prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha(tok));
  if (!row) return null;
  if (row.expires_at < iso()){
    db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  return row;
}

/* giả lập webhook.php — bản song sinh của api/webhook.php, chỉ khác là
   không gọi Telegram thật, chỉ ghi log để kiểm luồng cập nhật dữ liệu */
function webhook(req, res, body){
  const send = obj => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(obj)); };
  const secret = confGet('tg_webhook_secret', '');
  const given  = req.headers['x-telegram-bot-api-secret-token'] || '';
  if (!secret || secret !== given){ res.writeHead(403); return res.end('{}'); }

  let upd; try { upd = JSON.parse(body || '{}'); } catch(e){ return send({}); }
  const confChat = confGet('tg_chat', '');
  if (!confChat) return send({});

  /* ghi nhanh: "/ghi …" hoặc "+ …" nhắn thẳng vào group */
  if (upd.message){
    if (String(upd.message.chat && upd.message.chat.id) !== String(confChat)) return send({});
    const said = String(upd.message.text || '').trim();
    let note = '', reply = '';
    const mm = /^\/(ghi|them|note|n)(?:@\S+)?(?:\s+(.*))?$/us.exec(said);
    if (mm){
      note = String(mm[2] || '').trim();
      if (!note) reply = 'huong-dan-go-thieu';
    }
    else if (/^\/(help|start|tro_giup)(?:@\S+)?/us.test(said)) reply = 'bang-huong-dan';
    else if (said.startsWith('/'))                             reply = 'lenh-la';
    else if (said.startsWith('+'))                             note = said.slice(1).trim();

    if (reply){ console.log('[telegram thử · trả lời] ' + reply + ' cho: ' + said); return send({reply}); }
    if (!note) return send({});

    const nowIso = iso();
    const item = {id: Date.now().toString(16) + crypto.randomBytes(4).toString('hex'),
                  text: note, processed: false, processedAs: '',
                  createdAt: nowIso, updatedAt: nowIso, deleted: false};
    db().prepare('INSERT INTO items (kind,item_id,data,updated_at,deleted) VALUES (?,?,?,?,0)')
        .run('inbox', item.id, JSON.stringify(item), nowIso);
    console.log('[telegram thử · ghi nhanh] ' + note);
    return send({});
  }

  const cb = upd.callback_query;
  if (!cb) return send({});

  const data = String(cb.data || '');
  const chatId = String((cb.message && cb.message.chat && cb.message.chat.id) || '');
  if (chatId !== String(confChat)) return send({});

  /* nút "Xong hôm nay" của lời nhắc lặp lại */
  const rm = /^remdone:(.+)$/.exec(data);
  if (rm){
    const row = db().prepare('SELECT data FROM items WHERE kind = ? AND item_id = ?').get('reminders', rm[1]);
    let ok = false, already = false;
    if (row){
      const rem = JSON.parse(row.data);
      if (rem && !rem.deleted){
        const log = (rem.doneLog || []).map(String);
        if (log.includes(today_())) already = true;
        else {
          log.push(today_());
          rem.doneLog = log.slice(-80);
          rem.updatedAt = iso();
          db().prepare('UPDATE items SET data=?, updated_at=? WHERE kind=? AND item_id=?')
              .run(JSON.stringify(rem), rem.updatedAt, 'reminders', rm[1]);
        }
        ok = true;
      }
    }
    console.log('[telegram thử · webhook] ' + data + ' → ' +
      (!ok ? 'không tìm thấy' : already ? 'hôm nay đã tick rồi' : 'ghi nhận xong hôm nay'));
    return send({});
  }

  let act = '', kind = '', id = '', mins = 0, m;
  if ((m = /^done:(tasks|cards):(.+)$/.exec(data))){ act = 'done'; kind = m[1]; id = m[2]; }
  else if ((m = /^snz:(tasks|cards):(.+):(\d+)$/.exec(data))){
    act = 'snz'; kind = m[1]; id = m[2]; mins = +m[3];
    if (!SNOOZE_MINS[mins]) act = '';
  }

  if (act){
    const row = db().prepare('SELECT data FROM items WHERE kind = ? AND item_id = ?').get(kind, id);
    let ok = false, until = '', rolled = '';
    if (row){
      const item = JSON.parse(row.data);
      if (item && !item.deleted){
        const now = iso();
        if (act === 'done'){
          /* việc lặp lại: xong kỳ này thì hạn nhảy kỳ sau, KHÔNG done vĩnh viễn */
          if (kind === 'tasks' && isRepeat(item.repeat)){
            const due = String(item.due || '').slice(0,10);
            const onTime = !due || due >= today_();
            item.streak = (onTime ? +(item.streak || 0) : 0) + 1;
            item.bestStreak = Math.max(+(item.bestStreak || 0), item.streak);
            item.doneLog = (item.doneLog || []).map(String).concat(today_()).slice(-80);
            item.doneAt = today_();
            item.due = rolled = nextRepeat(due, item.repeat);
          }
          else if (kind === 'tasks'){ item.done = true; item.doneAt = today_(); }
          else { item.col = 'done'; item.doneAt = today_(); }
          item.snoozeUntil = '';
        } else {
          const d = new Date(Date.now() + mins * 60000);
          until = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          item.snoozeUntil = until;   // chỉ dời nhắc, hạn chót giữ nguyên
        }
        item.updatedAt = now;
        db().prepare('UPDATE items SET data=?, updated_at=? WHERE kind=? AND item_id=?')
            .run(JSON.stringify(item), now, kind, id);
        ok = true;
      }
    }
    console.log('[telegram thử · webhook] ' + data + ' → ' +
      (!ok ? 'không tìm thấy' : act !== 'done' ? 'dời tới ' + until
       : rolled ? 'xong kỳ này, lần tới ' + rolled : 'đánh dấu xong'));
  }
  send({});
}
function today_(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function api(req, res, body){
  const send = (obj, code = 200, extra = {}) => {
    res.writeHead(code, Object.assign(
      {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}, extra));
    res.end(JSON.stringify(obj));
  };
  const fail = (msg, code = 400) => send({ok:false, error:msg}, code);

  if (req.method !== 'POST') return fail('Chỉ nhận POST', 405);
  if (!String(req.headers['content-type'] || '').includes('application/json'))
    return fail('Content-Type phải là application/json', 415);
  if (!LH_PASSWORD)
    return fail('Chưa có api/config.php — chép config.example.php thành config.php rồi dán mã mật khẩu vào.', 503);

  let inp; try { inp = JSON.parse(body || '{}'); } catch(e){ return fail('JSON không hợp lệ'); }
  const s = session(req);
  const need = () => { if (!s) { fail('Chưa đăng nhập', 401); return false; } return true; };
  const ip = req.socket.remoteAddress || '?';

  switch (inp.action){
    case 'me':
      return send({ok:true, auth:!!s, server:true, expires:s ? s.expires_at : null});

    case 'login': {
      db().prepare('DELETE FROM login_fails WHERE at < ?').run(Math.floor(Date.now()/1000) - FAIL_WIN);
      const fails = db().prepare('SELECT COUNT(*) c FROM login_fails WHERE ip = ?').get(ip).c;
      if (fails >= FAIL_MAX) return fail('Sai quá nhiều lần. Thử lại sau 15 phút.', 429);
      if (!checkPassword(String(inp.password || ''))){
        db().prepare('INSERT INTO login_fails (ip, at) VALUES (?, ?)').run(ip, Math.floor(Date.now()/1000));
        return fail(`Sai mật khẩu. Còn ${Math.max(0, FAIL_MAX - fails - 1)} lần thử.`, 401);
      }
      db().prepare('DELETE FROM login_fails WHERE ip = ?').run(ip);
      const token = crypto.randomBytes(32).toString('hex');
      const exp = iso(Date.now() + SESSION_DAY * 86400000);
      db().prepare('INSERT INTO sessions (token_hash, created_at, expires_at, label) VALUES (?,?,?,?)')
          .run(sha(token), iso(), exp, String(req.headers['user-agent'] || '').slice(0,120));
      return send({ok:true, auth:true, expires:exp}, 200,
        {'Set-Cookie': `lh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAY*86400}`});
    }

    case 'logout': {
      const tok = cookieOf(req, 'lh_session');
      if (tok) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(tok));
      return send({ok:true, auth:false}, 200, {'Set-Cookie':'lh_session=; Path=/; HttpOnly; Max-Age=0'});
    }
    case 'logout_all':
      if (!need()) return;
      db().exec('DELETE FROM sessions');
      return send({ok:true, auth:false}, 200, {'Set-Cookie':'lh_session=; Path=/; HttpOnly; Max-Age=0'});

    case 'pull': {
      if (!need()) return;
      const rows = db().prepare(`SELECT kind, item_id, data, updated_at, deleted FROM items
                                 WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT ${PULL_LIMIT}`)
                       .all(String(inp.since || ''));
      return send({ok:true, now:iso(), more: rows.length >= PULL_LIMIT,
        rows: rows.map(r => ({kind:r.kind, item_id:r.item_id, data:JSON.parse(r.data),
                              updated_at:r.updated_at, deleted:!!r.deleted}))});
    }

    case 'push': {
      if (!need()) return;
      if (!Array.isArray(inp.rows)) return fail('Thiếu danh sách rows');
      if (inp.rows.length > 2000) return fail('Quá nhiều bản ghi trong một lượt', 413);
      const sel = db().prepare('SELECT updated_at FROM items WHERE kind = ? AND item_id = ?');
      const ins = db().prepare('INSERT INTO items (kind,item_id,data,updated_at,deleted) VALUES (?,?,?,?,?)');
      const upd = db().prepare('UPDATE items SET data=?, updated_at=?, deleted=? WHERE kind=? AND item_id=?');
      let saved = 0, skipped = 0;
      db().exec('BEGIN');
      try {
        for (const r of inp.rows){
          const kind = String(r.kind || ''), id = String(r.item_id || ''), up = String(r.updated_at || '');
          if (!kind || !id || !up){ skipped++; continue; }
          const json = JSON.stringify(r.data ?? null), del = r.deleted ? 1 : 0;
          const cur = sel.get(kind, id);
          if (!cur)                        { ins.run(kind, id, json, up, del); saved++; }
          else if (cur.updated_at < up)    { upd.run(json, up, del, kind, id); saved++; }
          else                             { skipped++; }
        }
        db().exec('COMMIT');
      } catch(e){ db().exec('ROLLBACK'); return fail('Ghi dữ liệu lỗi: ' + e.message, 500); }
      return send({ok:true, saved, skipped, now:iso()});
    }

    /* ---- Telegram ---- */
    case 'tg_get':
    case 'tg_save': {
      if (!need()) return;
      if (inp.action === 'tg_save'){
        if (inp.token && String(inp.token).trim()) confSet('tg_token', String(inp.token).trim());
        confSet('tg_chat',  String(inp.chatId || '').trim());
        confSet('tg_topic', String(inp.topic || '').trim());
        const h = inp.digestHour == null ? -1 : +inp.digestHour;
        confSet('tg_digest_hour', (h >= 0 && h <= 23) ? h : -1);
        const w = inp.workHour == null ? -1 : +inp.workHour;
        confSet('tg_work_hour', (w >= 0 && w <= 23) ? w : -1);
        for (const [k, conf] of Object.entries({
              taskTopic:'tg_task_topic', cardTopic:'tg_card_topic',
              remTopic:'tg_rem_topic',   reportTopic:'tg_report_topic'}))
          confSet(conf, String(inp[k] || '').trim());
        const wk = inp.weeklyHour == null ? -1 : +inp.weeklyHour;
        confSet('tg_weekly_hour', (wk >= 0 && wk <= 23) ? wk : -1);
        confSet('tg_staff_weekly', inp.staffWeekly ? '1' : '');
        confSet('tg_escalate', inp.escalate ? '1' : '');
        confSet('tg_enabled', inp.enabled ? '1' : '');
      }
      if (!confGet('cron_key')) confSet('cron_key', crypto.randomBytes(12).toString('hex'));
      return send({ok:true,
        hasToken: (confGet('tg_token','') || '') !== '',
        chatId: confGet('tg_chat',''), topic: confGet('tg_topic',''),
        digestHour: +confGet('tg_digest_hour','-1'),
        workHour: +confGet('tg_work_hour','-1'),
        taskTopic: confGet('tg_task_topic',''),
        cardTopic: confGet('tg_card_topic',''),
        remTopic: confGet('tg_rem_topic',''),
        reportTopic: confGet('tg_report_topic',''),
        workTopic: confGet('tg_work_topic',''),
        weeklyHour: +confGet('tg_weekly_hour','-1'),
        staffWeekly: !!confGet('tg_staff_weekly',''),
        escalate: !!confGet('tg_escalate',''),
        webhookOn: !!confGet('tg_webhook_on',''),
        enabled: !!confGet('tg_enabled',''),
        cron: '/usr/bin/php ' + path.join(__dirname, 'api/cron.php'),
        cronUrl: 'http://localhost:' + PORT + '/api/cron.php?key=' + confGet('cron_key','')});
    }
    case 'tg_send': {
      if (!need()) return;
      if (!confGet('tg_token','')) return fail('Chưa có mã bot Telegram', 502);
      if (!confGet('tg_chat',''))  return fail('Chưa chọn group Telegram', 502);
      /* máy chủ thử không gọi ra Telegram thật — chỉ ghi lại để kiểm */
      console.log('[telegram thử] nhánh=' + (inp.topic || confGet('tg_topic','') || 'chính') + ' · ' + inp.text);
      return send({ok:true, simulated:true});
    }
    case 'tg_discover': {
      if (!need()) return;
      return send({ok:true, chats:[
        {id:'-1001234567890', title:'Group thử nghiệm', topic:'',   name:''},
        {id:'-1001234567890', title:'Group thử nghiệm', topic:'12', name:'Việc cần làm'},
        {id:'-1001234567890', title:'Group thử nghiệm', topic:'18', name:'Giao việc'},
        {id:'-1001234567890', title:'Group thử nghiệm', topic:'24', name:'Báo cáo'}]});
    }
    case 'tg_dryrun': {
      if (!need()) return;
      return send({ok:true, result:runSchedule(true, inp.at), digest:buildDigest(),
                   work:buildWork(inp.at), weekly:buildWeekly(inp.at)});
    }
    case 'tg_work_now': {
      if (!need()) return;
      const lines = buildWork(inp.at);
      if (!lines.length) return send({ok:true, empty:true});
      console.log('[telegram thử · công việc] nhánh='
        + topicFor('report') + '\n' + lines.join('\n'));
      return send({ok:true, lines:lines.length});
    }
    case 'tg_why': {
      if (!need()) return;
      return send(Object.assign({ok:true}, tgWhy(inp.at)));
    }
    case 'tg_staff_now': {
      if (!need()) return;
      const people = buildStaffWeekly(inp.at);
      if (!people.length) return send({ok:true, empty:true});
      for (const s of people)
        console.log(`[telegram thử · nhân sự] nhánh=${topicFor('cards')}\n${s.name}\n${s.lines.join('\n')}`);
      return send({ok:true, people:people.length});
    }
    case 'tg_weekly_now': {
      if (!need()) return;
      const lines = buildWeekly(inp.at);
      console.log('[telegram thử · tuần] nhánh='
        + topicFor('report') + '\n' + lines.join('\n'));
      return send({ok:true, lines:lines.length});
    }
    case 'tg_webhook_enable': {
      if (!need()) return;
      if (!confGet('tg_token','')) return fail('Chưa có mã bot Telegram');
      if (!confGet('tg_webhook_secret')) confSet('tg_webhook_secret', crypto.randomBytes(16).toString('hex'));
      confSet('tg_webhook_on', '1');
      const url = 'http://localhost:' + PORT + '/api/webhook.php';
      console.log('[telegram thử] đã "đăng ký" webhook giả lập tại ' + url);
      return send({ok:true, url});
    }
    case 'tg_webhook_disable': {
      if (!need()) return;
      confSet('tg_webhook_on', '');
      return send({ok:true});
    }
    case 'tg_webhook_info': {
      if (!need()) return;
      /* máy chủ thử không hỏi Telegram thật — trả về đúng hình dạng dữ liệu,
         và cho ép trạng thái xấu bằng inp.broken để xem giao diện cảnh báo */
      const on = !!confGet('tg_webhook_on','');
      return send({ok:true,
        url: on ? 'http://localhost:' + PORT + '/api/webhook.php' : '',
        onMessage: on && !inp.broken, onButton: on,
        allowed: on ? (inp.broken ? ['callback_query'] : ['callback_query','message']) : [],
        pending: 0,
        lastError: inp.broken ? 'Wrong response from the webhook: 500' : '',
        lastErrorAt: inp.broken ? '09:35 17/08' : ''});
    }
    case 'tg_step': {            // chỉ có ở máy chủ thử: đối chiếu luật lặp với app
      if (!need()) return;
      return send({ok:true, iso: stepRepeat(String(inp.iso), String(inp.code))});
    }
    case 'tg_runnow': {          // chỉ có ở máy chủ thử, để kiểm bộ hẹn giờ
      if (!need()) return;
      return send({ok:true, result:runSchedule(false, inp.at)});
    }

    case 'stats': {
      if (!need()) return;
      const q = sql => db().prepare(sql).get();
      const f = path.join(__dirname, 'api/data/dev.sqlite');
      return send({ok:true,
        records: q('SELECT COUNT(*) c FROM items WHERE deleted = 0').c,
        trashed: q('SELECT COUNT(*) c FROM items WHERE deleted = 1').c,
        devices: q('SELECT COUNT(*) c FROM sessions').c,
        last:    q('SELECT MAX(updated_at) m FROM items').m,
        size:    fs.existsSync(f) ? fs.statSync(f).size : 0,
        dbInWebRoot: true, dbDir: path.join(__dirname, 'api/data')});
    }
  }
  return fail('Không hiểu yêu cầu: ' + inp.action, 404);
}

/* ---------------- máy chủ ---------------- */
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  if (p === '/api/index.php'){
    let body = '';
    req.on('data', c => { body += c; if (body.length > 12e6) req.destroy(); });
    req.on('end', () => { try { api(req, res, body); } catch(e){
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false, error:e.message}));
    }});
    return;
  }

  /* giả lập webhook.php — nút "✅ Xong" gọi lại đây khi ai bấm trên Telegram */
  if (p === '/api/webhook.php'){
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => { try { webhook(req, res, body); } catch(e){
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false, error:e.message}));
    }});
    return;
  }

  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); return res.end('not found'); }
    /* Gửi ETag giống Apache/LiteSpeed để chạy thử ở đây giống chạy thật:
       service worker dựa vào dấu này để biết máy chủ đã có bản mới. */
    const etag = '"' + crypto.createHash('sha1').update(data).digest('hex').slice(0, 16) + '"';
    if (req.headers['if-none-match'] === etag){ res.writeHead(304, {ETag: etag}); return res.end(); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'ETag': etag,
      'Cache-Control': 'no-cache, must-revalidate'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Life Hub → http://localhost:' + PORT);
  console.log(LH_PASSWORD ? 'API: bật · đăng nhập bằng mật khẩu trong api/config.php'
                          : 'API: chưa có api/config.php → app chạy chế độ chỉ lưu trên máy');
});
