/* Máy chủ chạy thử trên máy — phục vụ dist/ VÀ giả lập api/index.php.

   Phần API ở đây viết lại đúng logic của bản PHP (cùng thuật toán mật khẩu,
   cùng cách trộn bản ghi, cùng con trỏ đồng bộ) để thử đăng nhập và đồng bộ
   ngay trên máy, không cần cài PHP.

     node build.js && node serve.js     → http://localhost:5199
     node serve.js --src                → phục vụ thư mục nguồn

   Cần api/config.php (chép từ config.example.php, dán mã của
   "node tools/hash-password.js" vào) thì phần đăng nhập mới chạy.        */
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const useSrc = process.argv.includes('--src');
const ROOT = path.join(__dirname, useSrc ? '.' : 'dist');
const PORT = process.env.PORT || 5199;
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml',
  '.png':'image/png', '.txt':'text/plain; charset=utf-8',
  '.sql':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8'
};

if (!useSrc && !fs.existsSync(ROOT)){
  console.error('Chưa có dist/. Chạy "node build.js" trước.');
  process.exit(1);
}

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
const pad = n => String(n).padStart(2,'0');

function buildDigest(){
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const md = today.slice(5);
  const lines = [];

  const due = itemsOf('tasks').filter(t => !t.done && t.due && String(t.due).slice(0,10) <= today);
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
  if (lateCards) lines.push(`⚠️ ${lateCards} việc đã giao đang trễ`);
  if (owed) lines.push(`💰 Còn nợ công ngoài luồng: ${owed.toLocaleString('vi-VN')}₫ (${owedN} việc)`);
  return lines;
}

const alreadySent = k => !!db().prepare('SELECT 1 FROM sent WHERE k = ?').get(k);
const markSent = k => db().prepare('INSERT OR IGNORE INTO sent (k,at) VALUES (?,?)').run(k, Math.floor(Date.now()/1000));

/* atMs: cho phép giả lập "bây giờ là mấy giờ" khi chạy thử */
function runSchedule(dry, atMs){
  const done = [];
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
    if (dry){ done.push({reminder:r.title, dry:true}); continue; }
    markSent(key);
    done.push({reminder:r.title, ok:true, sent:`🔔 ${r.title}${r.note ? '\n'+r.note : ''}`,
               topic:r.topic || confGet('tg_topic','')});
  }

  const hour = +confGet('tg_digest_hour', '-1');
  if (hour >= 0 && now.getHours() >= hour){
    const key = 'digest:' + today;
    if (!alreadySent(key)){
      const lines = buildDigest();
      if (lines.length){
        if (dry) done.push({digest:lines.length, dry:true});
        else { markSent(key); done.push({digest:lines.length, ok:true, lines}); }
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
        confSet('tg_enabled', inp.enabled ? '1' : '');
      }
      if (!confGet('cron_key')) confSet('cron_key', crypto.randomBytes(12).toString('hex'));
      return send({ok:true,
        hasToken: (confGet('tg_token','') || '') !== '',
        chatId: confGet('tg_chat',''), topic: confGet('tg_topic',''),
        digestHour: +confGet('tg_digest_hour','-1'),
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
      return send({ok:true, chats:[{id:'-1001234567890', title:'Group thử nghiệm', topic:'12'}]});
    }
    case 'tg_dryrun': {
      if (!need()) return;
      return send({ok:true, result:runSchedule(true, inp.at), digest:buildDigest()});
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
        size:    fs.existsSync(f) ? fs.statSync(f).size : 0});
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

  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Life Hub (' + (useSrc ? 'nguồn' : 'dist') + ') → http://localhost:' + PORT);
  console.log(LH_PASSWORD ? 'API: bật · đăng nhập bằng mật khẩu trong api/config.php'
                          : 'API: chưa có api/config.php → app chạy chế độ chỉ lưu trên máy');
});
