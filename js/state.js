/* ============================================================
   state.js — dữ liệu, migration, tiện ích dùng chung
   ============================================================ */
"use strict";

/* ---------------- hằng số ---------------- */
const TIERS = {
  S: {label:'S',  name:'Gia đình', desc:'Ba mẹ, anh chị em, người trong nhà',      color:'var(--S)',  ping:14},
  S2:{label:'S2', name:'Họ hàng',  desc:'Cô dì chú bác, họ hàng gần',              color:'var(--S2)', ping:21},
  A: {label:'A',  name:'Tri kỷ',   desc:'Thân hơn bạn bè, chưa tới mức gia đình',  color:'var(--A)',  ping:30},
  B: {label:'B',  name:'Bạn bè',   desc:'Bạn bè, đồng nghiệp thân thiết',          color:'var(--B)',  ping:60},
  C: {label:'C',  name:'Xã giao',  desc:'Có qua lại nhưng không quá sâu',           color:'var(--C)',  ping:150}
};
const TIER_KEYS = ['S','S2','A','B','C'];

const COLS = [
  {id:'idea',     label:'Lên ý tưởng'},
  {id:'assigned', label:'Đã giao việc'},
  {id:'doing',    label:'Đang làm'},
  {id:'done',     label:'Hoàn thành'}
];
const COL_MAP = {backlog:'idea', todo:'assigned', doing:'doing', review:'doing', done:'done'};

const IDEA_ST = {seed:'Hạt giống', explore:'Đang nghiên cứu', doing:'Đang triển khai', done:'Đã xong', drop:'Tạm gác'};
const PRIO    = {high:'Cao', mid:'Bình thường', low:'Thấp'};

const LOG_KINDS = {
  meet:'☕ Gặp mặt', call:'📞 Gọi điện', text:'💬 Nhắn tin', meal:'🍚 Ăn uống',
  help:'🤝 Giúp đỡ', gift:'🎁 Quà cáp', event:'🎉 Sự kiện', other:'• Khác'
};

const REPEATS = {
  '':        'Không lặp',
  'd1':      'Hàng ngày',
  'd2':      'Cách 1 ngày',
  'w1':      'Hàng tuần',
  'w2':      '2 tuần một lần',
  'm1':      'Hàng tháng',
  'm3':      'Mỗi quý',
  'm6':      'Nửa năm',
  'y1':      'Hàng năm'
};

const AREA_COLORS = ['#5b8cff','#3ddc97','#ffb84d','#ff6b6b','#8b5cff','#4dd4d4','#ff8fd1','#a3b18a'];

/* ---------------- tiện ích ---------------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const now = () => new Date().toISOString();
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Bỏ dấu để tìm kiếm: gõ "tuan" vẫn ra "Tuấn", "do my linh" ra "Đỗ Mỹ Linh" */
function norm(s){
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d').trim();
}
const nl  = s => esc(s).replace(/\n/g,'<br>');

/* Hiểu được: 250000 · 250.000 · 300k · 1tr2 · 1,5tr · 1tr250 · 2 tỷ */
function parseMoney(v){
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).toLowerCase().trim().replace(/[₫đ]|vnd|vnđ/g,'').replace(/\s/g,'');
  if (!s) return 0;
  const m = s.match(/^(\d+(?:[.,]\d+)?)(k|nghin|nghìn|tr|trieu|triệu|m|ty|tỷ|b)(\d*)$/);
  if (m){
    const u = m[2];
    const mult = (u==='k'||u==='nghin'||u==='nghìn') ? 1e3
               : (u==='ty'||u==='tỷ'||u==='b')      ? 1e9 : 1e6;
    const base = parseFloat(m[1].replace(',','.')) || 0;
    const frac = m[3] ? parseFloat('0.' + m[3]) : 0;
    return Math.round((base + frac) * mult);
  }
  const n = parseFloat(s.replace(/[.,]/g,''));
  return isNaN(n) ? 0 : Math.round(n);
}
const money = n => (n||0).toLocaleString('vi-VN') + '₫';
function moneyShort(n){
  n = n || 0; const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a/1e9).toFixed(a%1e9?1:0).replace('.',',') + ' tỷ';
  if (a >= 1e6) return s + (a/1e6).toFixed(a%1e6?1:0).replace('.',',') + 'tr';
  if (a >= 1e3) return s + Math.round(a/1e3) + 'k';
  return s + a;
}
/* Ngày phải tính theo giờ địa phương. Dùng toISOString() ở đây sẽ lệch một ngày
   với các múi giờ lệch UTC (Việt Nam UTC+7 lệch từ 0h đến 7h sáng). */
function ymd(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
const today = () => ymd(new Date());
function fmtDate(iso){ if(!iso) return ''; const p = String(iso).slice(0,10).split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
function dayDiff(iso){
  if(!iso) return null;
  const a = new Date(String(iso).slice(0,10)+'T00:00:00'), b = new Date(today()+'T00:00:00');
  return Math.round((a-b)/86400000);
}
function addDays(iso, n){
  const d = new Date(String(iso).slice(0,10)+'T00:00:00');
  d.setDate(d.getDate()+n); return ymd(d);
}
function addMonths(iso, n){
  const d = new Date(String(iso).slice(0,10)+'T00:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth()+n);
  if (d.getDate() < day) d.setDate(0);       // 31/1 + 1 tháng → 28/2
  return ymd(d);
}
/* một bước lặp, không quan tâm quá khứ hay tương lai */
function stepRepeat(iso, code){
  const unit = code[0], n = +code.slice(1) || 1;
  return unit === 'd' ? addDays(iso, n)
       : unit === 'w' ? addDays(iso, 7*n)
       : unit === 'm' ? addMonths(iso, n)
       : addMonths(iso, 12*n);
}
function nextRepeat(iso, code){
  if (!code) return null;
  let base = iso || today(), guard = 0;
  // luôn nhảy tới mốc trong tương lai (tránh dồn việc khi bỏ lỡ nhiều kỳ)
  do { base = stepRepeat(base, code); } while (dayDiff(base) < 0 && ++guard < 400);
  return base;
}
/* các lần việc này rơi vào khoảng [from, to] — dùng cho lịch tháng */
function taskDatesIn(t, from, to){
  const out = [];
  if (!t.due || t.deleted) return out;
  if (!t.repeat || t.done){
    if (t.due >= from && t.due <= to) out.push(t.due);
    return out;
  }
  let d = t.due, guard = 0;
  while (d < from && guard++ < 3000) d = stepRepeat(d, t.repeat);
  guard = 0;
  while (d <= to && guard++ < 200){ out.push(d); d = stepRepeat(d, t.repeat); }
  if (t.due >= from && t.due <= to && !out.includes(t.due)) out.unshift(t.due);
  return out;
}
/* các lần một dịp rơi vào khoảng [from, to] */
function occasionDatesIn(o, from, to){
  const out = [];
  for (let y = +from.slice(0,4) - 1; y <= +to.slice(0,4) + 1; y++){
    let iso;
    if (o.cal === 'lunar'){
      const r = lunar2solar(o.day, o.month, y, 0);
      if (!r[0]) continue;
      iso = `${r[2]}-${String(r[1]).padStart(2,'0')}-${String(r[0]).padStart(2,'0')}`;
    } else {
      iso = `${y}-${String(o.month).padStart(2,'0')}-${String(o.day).padStart(2,'0')}`;
    }
    if (iso >= from && iso <= to && !out.includes(iso)) out.push(iso);
  }
  return out;
}
/* sinh nhật rơi vào khoảng [from, to] */
function birthdayDatesIn(p, from, to){
  if (!p.birthday || String(p.birthday).length < 10) return [];
  const md = String(p.birthday).slice(5);
  const out = [];
  for (let y = +from.slice(0,4); y <= +to.slice(0,4); y++){
    const iso = `${y}-${md}`;
    if (iso >= from && iso <= to) out.push(iso);
  }
  return out;
}
function agoText(iso){
  const d = dayDiff(iso); if(d===null) return '';
  const n = -d;
  if (n <= 0) return 'hôm nay';
  if (n === 1) return 'hôm qua';
  if (n < 30) return n + ' ngày trước';
  if (n < 365) return Math.round(n/30) + ' tháng trước';
  return (n/365).toFixed(1).replace('.',',') + ' năm trước';
}
function dueText(iso){
  const d = dayDiff(iso); if(d===null) return '';
  if (d === 0) return 'hôm nay';
  if (d === 1) return 'ngày mai';
  if (d < 0)  return 'trễ ' + (-d) + ' ngày';
  if (d < 30) return 'còn ' + d + ' ngày';
  return fmtDate(iso);
}
function nextBirthday(iso){
  if(!iso) return null;
  const p = String(iso).slice(0,10).split('-'); if (p.length < 3) return null;
  const nowD = new Date(today()+'T00:00:00');
  let d = new Date(nowD.getFullYear(), +p[1]-1, +p[2]);
  if (d < nowD) d = new Date(nowD.getFullYear()+1, +p[1]-1, +p[2]);
  return Math.round((d-nowD)/86400000);
}
function initials(name){
  /* Bỏ ngoặc và dấu câu trước đã: "Cô Tư (dì ruột)" phải ra CT chứ không phải "(R" */
  const w = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length > 1 ? w[w.length-2][0] + w[w.length-1][0] : w[0].slice(0,2)).toUpperCase();
}
function toast(msg){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2100);
}

/* ---------------- kho dữ liệu ---------------- */
const KEY = 'lifehub.v2';
const OLD  = 'lifehub.v1';
const COLLECTIONS = ['people','gifts','tasks','ideas','cards','staff','areas','occasions','inbox','reminders'];

function blank(){
  return {
    people:[], gifts:[], tasks:[], ideas:[], cards:[], staff:[], areas:[], occasions:[], inbox:[],
    reminders:[],
    settings:{
      theme:'dark',
      notifyHour:8,
      notifyOn:false,
      supabaseUrl:'', supabaseKey:'', workspace:'',
      role:'owner',          // 'owner' | 'staff'
      staffName:''
    },
    meta:{ notified:{}, lastPull:null, lastPush:null, srvPull:'', srvPush:'' }
  };
}
let db = blank();

/* mọi bản ghi đều có id + updatedAt + deleted để đồng bộ theo từng dòng */
function stamp(o){ o.updatedAt = now(); if(!o.id) o.id = uid(); if(o.deleted===undefined) o.deleted = false; return o; }
function alive(arr){ return (arr||[]).filter(x => !x.deleted); }

function load(){
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch(e){}
  if (raw) { db = merge(blank(), raw); }
  else {
    let v1 = null;
    try { v1 = JSON.parse(localStorage.getItem(OLD)); } catch(e){}
    db = v1 ? migrateV1(v1) : blank();
  }
  ensure();
  return db;
}
function merge(base, raw){
  const out = Object.assign({}, base, raw);
  out.settings = Object.assign({}, base.settings, raw.settings || {});
  out.meta     = Object.assign({}, base.meta,     raw.meta     || {});
  COLLECTIONS.forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  return out;
}
function migrateV1(v1){
  const d = blank();
  d.settings.theme = v1.theme || 'dark';
  (v1.people||[]).forEach(p => d.people.push(stamp(Object.assign({logs:[], areaId:''}, p))));
  (v1.gifts ||[]).forEach(g => d.gifts.push(stamp(Object.assign({}, g))));
  (v1.tasks ||[]).forEach(t => d.tasks.push(stamp(Object.assign({repeat:'', streak:0, bestStreak:0, areaId:''}, t))));
  (v1.ideas ||[]).forEach(i => d.ideas.push(stamp(Object.assign({areaId:''}, i))));
  (v1.staff ||[]).forEach(s => d.staff.push(stamp(Object.assign({}, s))));
  (v1.cards ||[]).forEach(c => d.cards.push(stamp(Object.assign({}, c, {col: COL_MAP[c.col] || 'assigned', areaId:''}))));
  return d;
}
/* vá dữ liệu cũ / thiếu trường */
function ensure(){
  COLLECTIONS.forEach(k => db[k].forEach(o => {
    if (!o.id) o.id = uid();
    if (o.deleted === undefined) o.deleted = false;
    if (!o.updatedAt) o.updatedAt = now();
  }));
  /* Nhóm phải luôn là một trong S/A/B/C. Dữ liệu nhập từ file cũ hoặc
     đồng bộ về mà thiếu trường này sẽ làm sập cả app ở TIERS[p.tier]. */
  db.people.forEach(p => { if(!Array.isArray(p.logs)) p.logs = []; if(p.areaId===undefined) p.areaId='';
                           if(!TIERS[p.tier]) p.tier = 'B'; if(typeof p.name !== 'string') p.name = String(p.name || 'Không tên'); });
  db.tasks .forEach(t => { if(t.repeat===undefined) t.repeat=''; if(t.streak===undefined) t.streak=0;
                           if(t.bestStreak===undefined) t.bestStreak=0; if(t.areaId===undefined) t.areaId='';
                           /* giờ máy chủ đẩy tin nhắc riêng cho việc này; rỗng = không đẩy */
                           if(t.remindAt===undefined) t.remindAt='';
                           /* mốc đã bấm dời nhắc, "YYYY-MM-DD HH:MM" giờ VN; rỗng = không dời */
                           if(t.snoozeUntil===undefined) t.snoozeUntil='';
                           /* nhắc thêm một tin trước hạn bao nhiêu ngày; 0 = không báo trước */
                           if(t.remindBefore===undefined) t.remindBefore=0; });
  db.ideas .forEach(i => { if(i.areaId===undefined) i.areaId='';
                           /* Ý tưởng từ bản v1 chưa có trường này — để trống thì
                              chip trạng thái rỗng và thứ tự sắp xếp lộn xộn. */
                           if(!IDEA_ST[i.status]) i.status='seed';
                           /* ngày hẹn xem lại, 'YYYY-MM-DD'; rỗng = không nhắc */
                           if(i.reviewAt===undefined) i.reviewAt=''; });
  db.inbox.forEach(n => { if(n.processed===undefined) n.processed = false; if(!n.text) n.text = ''; });
  db.staff.forEach(s2 => { if(!Array.isArray(s2.areaIds)) s2.areaIds = [];
                           if(s2.phone===undefined) s2.phone = ''; if(s2.startDate===undefined) s2.startDate = '';
                           if(s2.birthday===undefined) s2.birthday = '';
                           if(s2.note===undefined) s2.note = ''; });
  db.reminders.forEach(r => { if(!Array.isArray(r.days)) r.days = [];
                              r.days = r.days.map(Number).filter(d => d >= 0 && d <= 6);
                              if(!r.time) r.time = '08:00'; if(r.topic===undefined) r.topic = '';
                              if(r.enabled===undefined) r.enabled = true;
                              if(r.note===undefined) r.note = ''; if(r.lastSent===undefined) r.lastSent = '';
                              /* việc này ngốn bao nhiêu phút — để xếp lên dòng thời gian
                                 và bắt trùng giờ. Bản cũ chưa có, cho tạm 15 phút. */
                              if(r.mins===undefined) r.mins = 15;
                              if(r.areaId===undefined) r.areaId = '';
                              /* những ngày đã tick xong — nguồn duy nhất để tính chuỗi 🔥 */
                              if(!Array.isArray(r.doneLog)) r.doneLog = []; });
  db.occasions.forEach(o => { if(!Array.isArray(o.personIds)) o.personIds = [];
                              if(o.remind===undefined) o.remind = 7; if(!o.cal) o.cal = 'solar';
                              /* Lần tới rơi vào ngày dương nào — tính sẵn ở đây để máy chủ
                                 gửi nhắc qua Telegram mà không phải cài lịch âm bên PHP. */
                              const n = occasionNext(o);
                              if (n && o.nextIso !== n.iso){ o.nextIso = n.iso; stamp(o); } });
  db.cards .forEach(c => { if(c.doneAt===undefined) c.doneAt = ''; if(c.extra===undefined) c.extra=false; if(c.extraPay===undefined) c.extraPay=0;
                           if(c.extraPaidDate===undefined) c.extraPaidDate='';
                           if(c.areaId===undefined) c.areaId=''; if(COL_MAP[c.col]) c.col = COL_MAP[c.col];
                           if(!COLS.some(x=>x.id===c.col)) c.col='assigned';
                           if(!Array.isArray(c.checklist)) c.checklist=[];
                           if(c.remindAt===undefined) c.remindAt='';
                           if(c.snoozeUntil===undefined) c.snoozeUntil='';
                           if(c.remindBefore===undefined) c.remindBefore=0; });
  if (!db.settings.workspace) db.settings.workspace = '';
}
/* Safari ở chế độ riêng tư, hoặc kho đầy, sẽ ném lỗi ở đây. Không bắt thì
   thao tác đang làm dở sẽ đứng im mà không báo gì. */
let _saveWarned = false;
function persist(){
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch(e){
    if (!_saveWarned){
      _saveWarned = true;
      toast('Không lưu được xuống máy — hãy xuất sao lưu ngay và kiểm tra dung lượng trình duyệt');
    }
    return false;
  }
}
function save(){
  persist();
  if (window.Sync) Sync.markDirty();
}

/* ---------------- truy vấn ---------------- */
function people(){ return alive(db.people); }
function tasks(){  return alive(db.tasks);  }
function ideas(){  return alive(db.ideas);  }

/* ---- hẹn xem lại ý tưởng ----
   Ý tưởng khác việc ở chỗ nó không có hạn, nên nó chìm. Đặt một ngày hẹn
   để tới hôm đó máy chủ hỏi lại "làm hay bỏ".
   Bốn mức dùng chung mã với việc lặp lại (m1/m3/m6/y1) để chỉ có một hàm
   cộng ngày duy nhất — stepRepeat, đã dò khớp giữa JS và PHP. */
const REVIEW_IN = [['m1','Sau 1 tháng'], ['m3','Sau 3 tháng'],
                   ['m6','Sau 6 tháng'], ['y1','Sau 1 năm']];
const reviewDate = code => stepRepeat(today(), code);
/* tới hẹn = đúng hôm nay hoặc đã qua; ý tưởng đã xong/gác thì thôi */
function ideaDue(i){
  const d = String(i.reviewAt || '').slice(0,10);
  return d.length === 10 && d <= today() && i.status !== 'done' && i.status !== 'drop';
}
function ideasDue(){ return ideas().filter(ideaDue); }
function cards(){  return alive(db.cards);  }
function gifts(){  return alive(db.gifts);  }
function staff(){  return alive(db.staff);  }
function areas(){  return alive(db.areas);  }
function occasions(){ return alive(db.occasions); }
/* ============================================================
   VIỆC NGOÀI LUỒNG — việc giao thêm ngoài nhiệm vụ thường ngày,
   cần chi trả hoặc thưởng riêng cho người làm.
   ============================================================ */
function extraCards(){ return cards().filter(c => c.extra); }
function staffByName(name){ return staff().find(s2 => s2.name === name) || null; }

/* toàn bộ số liệu của một nhân viên, dùng cho trang hồ sơ */
function staffStats(name){
  const mine = cards().filter(c => c.assignee === name);
  const done = mine.filter(c => c.col === 'done');
  const late = mine.filter(c => c.col !== 'done' && c.due && dayDiff(c.due) < 0);
  /* Chỉ chấm đúng hạn trên những thẻ có đủ cả mốc hoàn thành lẫn hạn chót.
     Không suy từ updatedAt vì trường đó đổi mỗi lần sửa thẻ. */
  const judged = done.filter(c => c.doneAt && c.due);
  const onTime = judged.filter(c => c.doneAt <= c.due);
  const ex = mine.filter(c => c.extra);
  const t  = extraTotals(ex);
  return {
    cards:mine, done, late, ex,
    total:mine.length,
    doneN:done.length,
    lateN:late.length,
    activeN:mine.filter(c => c.col === 'doing' || c.col === 'assigned').length,
    pct: mine.length ? Math.round(done.length / mine.length * 100) : 0,
    onTimePct: judged.length ? Math.round(onTime.length / judged.length * 100) : null,
    judgedN: judged.length,
    owed:t.owed, paid:t.paid, exCount:t.count
  };
}
function extraTotals(list){
  const src = list || extraCards();
  let owed = 0, paid = 0;
  src.forEach(c => { if (c.extraPaidDate) paid += c.extraPay || 0; else owed += c.extraPay || 0; });
  return {owed, paid, count:src.length, unpaid:src.filter(c => !c.extraPaidDate).length};
}
/* gom theo người làm, để biết còn nợ công ai bao nhiêu */
function extraByStaff(){
  const map = {};
  extraCards().forEach(c => {
    const who = c.assignee || '— chưa giao —';
    (map[who] = map[who] || []).push(c);
  });
  return Object.keys(map).map(who => Object.assign({who, items:map[who]}, extraTotals(map[who])))
               .sort((a,b) => b.owed - a.owed);
}

function inbox(){ return alive(db.inbox).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')); }
function inboxOpen(){ return inbox().filter(n => !n.processed); }
function areaOf(id){ return areas().find(a => a.id === id) || null; }

/* lọc theo mảng việc đang chọn */
function byArea(arr, areaId){ return areaId === 'all' ? arr : arr.filter(x => x.areaId === areaId); }

function giftsOf(pid){ return gifts().filter(g => g.personId === pid); }
function balance(pid){
  let inV = 0, outV = 0, open = 0;
  for (const g of giftsOf(pid)){
    if (g.dir === 'in'){
      inV += g.value || 0;
      if (g.repay) outV += g.repay.value || 0; else open++;
    } else outV += g.value || 0;
  }
  return { in:inV, out:outV, diff:inV - outV, open };
}
/* điểm "chăm sóc" 0-100: càng lâu không liên lạc so với chu kỳ của nhóm thì càng thấp */
function careScore(p){
  const ping = TIERS[p.tier].ping;
  if (!p.lastContact) return 0;
  const gap = Math.max(0, -dayDiff(p.lastContact));
  return Math.max(0, Math.min(100, Math.round(100 - (gap / ping) * 100)));
}
function careColor(s){ return s >= 60 ? 'var(--ok)' : s >= 30 ? 'var(--warn)' : 'var(--bad)'; }

/* việc cần chú ý hôm nay, dùng cho badge + thông báo */
function dueTasks(){ return tasks().filter(t => !t.done && t.due && dayDiff(t.due) <= 0); }
function lateCards(){ return cards().filter(c => c.col !== 'done' && c.due && dayDiff(c.due) < 0); }
function staleP(){
  return people().map(p => ({p, over: (p.lastContact ? -dayDiff(p.lastContact) : 999) - TIERS[p.tier].ping}))
                 .filter(x => x.over > 0).sort((a,b) => b.over - a.over);
}
function upcomingBirthdays(win){
  const w = (win == null ? 45 : win);          // win = 0 nghĩa là "đúng hôm nay"
  return people().map(p => ({p, d:nextBirthday(p.birthday)}))
                 .filter(x => x.d !== null && x.d <= w).sort((a,b) => a.d - b.d);
}
/* Sinh nhật của cả người quen lẫn nhân viên — nhân viên cũng cần được nhớ */
function allBirthdays(win){
  const w = (win == null ? 45 : win);
  const out = [];
  people().forEach(p => { const d = nextBirthday(p.birthday);
    if (d !== null && d <= w) out.push({kind:'person', id:p.id, name:p.name, birthday:p.birthday,
                                        sub:'nhóm ' + p.tier, tier:p.tier, d}); });
  staff().forEach(s2 => { const d = nextBirthday(s2.birthday);
    if (d !== null && d <= w) out.push({kind:'staff', id:s2.id, name:s2.name, birthday:s2.birthday,
                                        sub:s2.role || 'nhân sự', d}); });
  return out.sort((a,b) => a.d - b.d || a.name.localeCompare(b.name,'vi'));
}

/* ============================================================
   NHẮC LẶP LẠI THEO THỨ + GIỜ  (dùng cho thông báo Telegram)
   Ví dụ: tập gym T2·T3·T5·T6·T7 lúc 18:30
   Ngày dùng quy ước của JavaScript: 0 = Chủ nhật … 6 = Thứ 7
   ============================================================ */
const WDAYS = [[1,'T2'],[2,'T3'],[3,'T4'],[4,'T5'],[5,'T6'],[6,'T7'],[0,'CN']];
const WDAY_NAME = {0:'Chủ nhật',1:'Thứ 2',2:'Thứ 3',3:'Thứ 4',4:'Thứ 5',5:'Thứ 6',6:'Thứ 7'};

function reminders(){ return alive(db.reminders); }

function daysText(days){
  const d = (days || []).slice().sort((a,b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  if (!d.length) return 'chưa chọn ngày';
  if (d.length === 7) return 'hằng ngày';
  if (d.length === 5 && [1,2,3,4,5].every(x => d.includes(x))) return 'thứ 2 → thứ 6';
  if (d.length === 2 && d.includes(6) && d.includes(0)) return 'cuối tuần';
  return d.map(x => (WDAYS.find(w => w[0] === x) || [])[1]).join(' · ');
}
/* Lần chạy kế tiếp của một lời nhắc, tính từ bây giờ */
function reminderNext(r){
  if (!r.enabled || !(r.days || []).length) return null;
  const [hh, mm] = String(r.time || '08:00').split(':').map(Number);
  const now = new Date();
  for (let i = 0; i < 8; i++){
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh || 0, mm || 0, 0, 0);
    if (r.days.includes(d.getDay()) && d > now) return d;
  }
  return null;
}
function reminderNextText(r){
  const d = reminderNext(r);
  if (!d) return r.enabled ? 'chưa chọn ngày' : 'đang tắt';
  const gap = Math.round((d - new Date()) / 60000);
  const hm = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  if (gap < 60) return `còn ${gap} phút`;
  if (ymd(d) === today()) return `hôm nay ${hm}`;
  if (ymd(d) === addDays(today(), 1)) return `mai ${hm}`;
  return `${WDAY_NAME[d.getDay()]} ${fmtDate(ymd(d))} ${hm}`;
}

/* Tick "xong hôm nay" cho lời nhắc lặp lại. Máy chủ (webhook Telegram) chỉ
   ghi thêm ngày vào doneLog; luật tính chuỗi để nguyên một chỗ ở đây, để
   hai bên không bao giờ tính ra hai con số khác nhau. */
const remDoneToday = r => (r.doneLog || []).map(String).includes(today());
function remStreak(r){
  const days = (r.days || []).map(Number);
  if (!days.length) return 0;
  const log = new Set((r.doneLog || []).map(String));
  const t0 = today();
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let n = 0;
  for (let i = 0; i < 366; i++){                 // lùi tối đa một năm rồi thôi
    const iso = ymd(d);
    if (days.includes(d.getDay())){
      if (log.has(iso)) n++;
      /* Hôm nay chưa tick thì chưa coi là đứt chuỗi — ngày còn chưa hết. */
      else if (iso !== t0) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* ============================================================
   VIỆC HẰNG NGÀY — DÒNG THỜI GIAN
   Cùng một bản ghi với lời nhắc lặp lại (db.reminders): tập gym, trả lời
   tin khách… đều là việc lặp đi lặp lại có giờ. Thêm `mins` là đủ để xếp
   chúng lên một trục thời gian và thấy việc nào đè lên việc nào.
   ============================================================ */
const TL_SNAP = 5;               /* kéo khối thì nhích theo từng 5 phút */
const TL_MIN_SPAN = 240;         /* trục luôn rộng ít nhất 4 tiếng, không thì một
                                    việc 15 phút bị kéo giãn ra cả màn hình */

/* Bỏ trống, số âm, số 0 hay chữ vớ vẩn đều rơi về 15 phút; số quá lớn thì cắt
   xuống 12 tiếng. Dòng thời gian không bao giờ được nhận số âm — khối sẽ vẽ
   ngược. Mọi nơi phải gọi hàm này, kể cả bên PHP có bản y hệt. */
function cleanMins(v){
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 720) : 15;
}
const remMins = r => cleanMins(r && r.mins);
function hhmm2min(s){
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(s == null ? '' : s).trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
function min2hhmm(m){
  const v = Math.max(0, Math.round(m));
  return String(Math.floor(v / 60) % 24).padStart(2,'0') + ':' + String(v % 60).padStart(2,'0');
}
function fmtDur(m){
  const v = Math.max(0, Math.round(m));
  if (v < 60) return v + 'p';
  const h = Math.floor(v / 60), r = v % 60;
  return r ? h + 'h' + String(r).padStart(2,'0') : h + 'h';
}
const snap5 = m => Math.max(0, Math.min(Math.round(m / TL_SNAP) * TL_SNAP, 23 * 60 + 55));

/* Mọi việc của một thứ trong tuần, kể cả việc đang tắt — bên dùng tự lọc
   theo `on` khi cộng tổng, để việc tắt vẫn hiện mờ chứ không biến mất. */
function dayItems(wd, areaId){
  return byArea(reminders(), areaId === undefined ? 'all' : areaId)
    .filter(r => (r.days || []).map(Number).includes(Number(wd)))
    .map(r => ({id:r.id, r, start:hhmm2min(r.time), mins:remMins(r),
                on:!!r.enabled, title:r.title || 'Không tên', areaId:r.areaId || ''}))
    .filter(x => x.start !== null)
    .sort((a,b) => a.start - b.start || String(a.title).localeCompare(b.title));
}
/* Hai việc đè lên nhau khi khoảng giờ của chúng cắt nhau. Việc đang tắt
   không tính — tắt rồi thì có trùng cũng chẳng sao. */
function dayClash(items){
  const live = (items || []).filter(x => x.on);
  const ids = new Set();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++){
      const a = live[i], b = live[j];
      if (b.start < a.start + a.mins && a.start < b.start + b.mins){ ids.add(a.id); ids.add(b.id); }
    }
  return ids;
}
function dayLoad(items){
  const live = (items || []).filter(x => x.on);
  return {count:live.length, mins:live.reduce((n,x) => n + x.mins, 0), clash:dayClash(live).size};
}
/* Bảy thứ theo đúng thứ tự T2 → CN */
function weekLoad(areaId){
  return WDAYS.map(([wd, lbl]) => {
    const items = dayItems(wd, areaId);
    return {wd, lbl, items, load:dayLoad(items)};
  });
}
/* Còn mấy việc chưa tick hôm nay — con số trên menu */
function dailyLeft(){
  const wd = new Date().getDay();
  return reminders().filter(r => r.enabled && (r.days || []).map(Number).includes(wd)
                                 && !remDoneToday(r)).length;
}

/* ============================================================
   DỊP & LỄ
   Ngày lưu dạng ngày/tháng + loại lịch (dương hoặc âm), lặp mỗi năm.
   ============================================================ */
const OCCASION_PRESETS = [
  {title:'Tết Nguyên Đán',      cal:'lunar', day:1,  month:1,  remind:21},
  {title:'Rằm tháng Giêng',     cal:'lunar', day:15, month:1,  remind:5},
  {title:'Giỗ Tổ Hùng Vương',   cal:'lunar', day:10, month:3,  remind:5},
  {title:'Tết Đoan Ngọ',        cal:'lunar', day:5,  month:5,  remind:5},
  {title:'Lễ Vu Lan',           cal:'lunar', day:15, month:7,  remind:7},
  {title:'Tết Trung Thu',       cal:'lunar', day:15, month:8,  remind:10},
  {title:'Ông Công ông Táo',    cal:'lunar', day:23, month:12, remind:5},
  {title:'Tết Dương lịch',      cal:'solar', day:1,  month:1,  remind:5},
  {title:'Ngày Thầy thuốc VN',  cal:'solar', day:27, month:2,  remind:5},
  {title:'Quốc tế Phụ nữ 8/3',  cal:'solar', day:8,  month:3,  remind:7},
  {title:'Quốc tế Thiếu nhi',   cal:'solar', day:1,  month:6,  remind:5},
  {title:'Doanh nhân Việt Nam', cal:'solar', day:13, month:10, remind:5},
  {title:'Phụ nữ Việt Nam 20/10', cal:'solar', day:20, month:10, remind:7},
  {title:'Ngày Nhà giáo 20/11', cal:'solar', day:20, month:11, remind:7},
  {title:'Giáng sinh',          cal:'solar', day:24, month:12, remind:7}
];

/* ngày dương kế tiếp của một dịp + số ngày còn lại */
function occasionNext(o){
  const iso = o.cal === 'lunar' ? nextLunarDate(o.day, o.month) : nextSolarDate(o.day, o.month);
  return iso ? {iso, d:dayDiff(iso)} : null;
}
function upcomingOccasions(win){
  const w = (win == null ? 60 : win);
  return occasions().map(o => {
    const n = occasionNext(o);
    return n ? {o, iso:n.iso, d:n.d} : null;
  }).filter(x => x && x.d <= w).sort((a,b) => a.d - b.d);
}
/* dịp đang tới hạn nhắc (theo số ngày báo trước của từng dịp) */
function dueOccasions(){
  return upcomingOccasions(400).filter(x => x.d <= (x.o.remind ?? 7));
}

/* ---- gợi ý mức quà ----
   Ưu tiên theo lịch sử tặng cho chính người đó vào chính dịp đó.
   Không có lịch sử thì lấy mức trung bình đã tặng người đó, rồi tới
   mức mặc định theo nhóm. Nếu đang nợ ân tình nhiều hơn thì nâng lên
   cho bằng phần đang nợ.                                            */
const TIER_GIFT = {S:1000000, S2:800000, A:700000, B:400000, C:200000};
function roundGift(n){
  if (n <= 0) return 0;
  const step = n >= 2000000 ? 500000 : n >= 500000 ? 100000 : 50000;
  return Math.round(n/step)*step;
}
function suggestGift(personId, occasionTitle){
  const p = people().find(x => x.id === personId);
  if (!p) return null;
  const out = giftsOf(personId).filter(g => g.dir === 'out' && g.value > 0);
  const key = String(occasionTitle||'').toLowerCase();
  const same = key ? out.filter(g => (g.occasion||'').toLowerCase().includes(key)
                                  || key.includes((g.occasion||'').toLowerCase()) && g.occasion) : [];
  const avg = a => Math.round(a.reduce((s,g) => s + g.value, 0)/a.length);

  let base, why;
  if (same.length){ base = avg(same); why = `lần trước tặng ${moneyShort(same[same.length-1].value)}`; }
  else if (out.length){ base = avg(out); why = `trung bình bạn tặng ${moneyShort(base)}`; }
  else { base = TIER_GIFT[p.tier]; why = `mức thường thấy cho nhóm ${p.tier}`; }

  const debt = balance(personId).diff;
  if (debt > base){ return {amount:roundGift(debt), why:`đang nợ ${moneyShort(debt)} ân tình`}; }
  return {amount:roundGift(base), why};
}

/* ============================================================
   LỊCH — gom mọi thứ rơi vào khoảng ngày, theo từng ngày
   Trả về { 'YYYY-MM-DD': [ {kind, title, color, id, ...} ] }
   ============================================================ */
function calendarMap(from, to, areaId){
  const map = {};
  const put = (iso, ev) => { (map[iso] = map[iso] || []).push(ev); };
  const colorOf = id => (areaOf(id) || {}).color || 'var(--acc)';

  byArea(tasks(), areaId || 'all').forEach(t => {
    const seen = new Set();
    taskDatesIn(t, from, to).forEach(d => {
      seen.add(d);
      const ghost = !!t.repeat && d !== t.due;   // kỳ lặp trong tương lai
      put(d, {kind:'task', id:t.id, title:t.title, color:colorOf(t.areaId),
              done:t.done, prio:t.prio, repeat:t.repeat, ghost,
              canTick: !ghost});                 // chỉ tick được kỳ hiện tại
    });
    /* việc lặp không giữ trạng thái "done", nên lấy lịch sử hoàn thành
       để lịch còn ghi lại được những buổi đã làm */
    if (t.repeat) (t.doneLog || []).forEach(d => {
      if (d < from || d > to || seen.has(d)) return;
      seen.add(d);
      put(d, {kind:'task', id:t.id, title:t.title, color:colorOf(t.areaId),
              done:true, repeat:t.repeat, record:true, canTick:false});
    });
  });

  byArea(cards(), areaId || 'all').forEach(c => {
    if (c.due && c.due >= from && c.due <= to)
      put(c.due, {kind:'card', id:c.id, title:c.title, color:colorOf(c.areaId),
                  done:c.col === 'done', who:c.assignee, canTick:true});
  });

  occasions().forEach(o =>
    occasionDatesIn(o, from, to).forEach(d => put(d, {
      kind:'occasion', id:o.id, title:o.title, color:'var(--acc2)', cal:o.cal})));

  people().forEach(p =>
    birthdayDatesIn(p, from, to).forEach(d => put(d, {
      kind:'birthday', id:p.id, title:'Sinh nhật ' + p.name, color:'var(--A)'})));

  staff().forEach(s2 =>
    birthdayDatesIn(s2, from, to).forEach(d => put(d, {
      kind:'staffBirthday', id:s2.id, title:'Sinh nhật ' + s2.name + ' (nhân viên)', color:'var(--acc)'})));

  /* Việc lặp hằng ngày rất dễ chiếm hết chỗ hiển thị của ô, nên xếp
     dịp và sinh nhật lên trước, kỳ lặp tương lai xuống cuối. */
  const rank = e => e.kind === 'occasion' ? 0 : (e.kind === 'birthday' || e.kind === 'staffBirthday') ? 1
                  : e.done ? 5 : e.ghost ? 4 : e.kind === 'card' ? 2 : 3;
  Object.keys(map).forEach(d => map[d].sort((a,b) => rank(a) - rank(b)));
  return map;
}

/* ============================================================
   TÌM KIẾM TOÀN CỤC — bỏ dấu, xuyên mọi loại dữ liệu
   ============================================================ */
function searchAll(q, limit){
  const k = norm(q);
  if (!k) return [];
  const hit = (...parts) => norm(parts.filter(Boolean).join(' ')).includes(k);
  const out = [];
  const areaName = id => (areaOf(id) || {}).name || '';

  people().forEach(p => { if (hit(p.name, p.note, p.tags, areaName(p.areaId),
      (p.logs||[]).map(l => l.text).join(' ')))
    out.push({kind:'person', id:p.id, title:p.name,
      sub:`${p.tier} · ${TIERS[p.tier].name}` + (p.lastContact ? ' · gặp ' + agoText(p.lastContact) : ''),
      color:TIERS[p.tier].color}); });

  tasks().forEach(t => { if (hit(t.title, t.note, areaName(t.areaId)))
    out.push({kind:'task', id:t.id, title:t.title,
      sub:(t.done ? 'đã xong' : t.due ? dueText(t.due) : 'không hạn')
          + (areaName(t.areaId) ? ' · ' + areaName(t.areaId) : ''),
      color:(areaOf(t.areaId)||{}).color || 'var(--ok)'}); });

  /* Việc hằng ngày dùng chung bản ghi với lời nhắc lặp lại — trước nay tìm
     không ra vì searchAll bỏ sót hẳn, dù nhãn đã có sẵn trong KIND_LABEL. */
  reminders().forEach(r => { if (hit(r.title, r.note, areaName(r.areaId)))
    out.push({kind:'reminder', id:r.id, title:r.title,
      sub:daysText(r.days) + ' · ' + r.time + ' · ' + fmtDur(remMins(r)) + (r.enabled ? '' : ' · đang tắt'),
      color:(areaOf(r.areaId)||{}).color || 'var(--warn)'}); });

  ideas().forEach(i => { if (hit(i.title, i.detail, i.plan, areaName(i.areaId)))
    out.push({kind:'idea', id:i.id, title:i.title,
      sub:(IDEA_ST[i.status]||'') + (areaName(i.areaId) ? ' · ' + areaName(i.areaId) : ''),
      color:(areaOf(i.areaId)||{}).color || 'var(--warn)'}); });

  cards().forEach(c => { if (hit(c.title, c.desc, c.assignee, areaName(c.areaId)))
    out.push({kind:'card', id:c.id, title:c.title,
      sub:(COLS.find(x => x.id === c.col)||{}).label + (c.assignee ? ' · ' + c.assignee : ''),
      color:(areaOf(c.areaId)||{}).color || 'var(--acc)'}); });

  occasions().forEach(o => { if (hit(o.title, o.note)){
    const n = occasionNext(o);
    out.push({kind:'occasion', id:o.id, title:o.title,
      sub:n ? fmtDate(n.iso) + ' · còn ' + n.d + ' ngày' : '', color:'var(--acc2)'});
  }});

  gifts().forEach(g => { if (hit(g.title, g.occasion, g.note)){
    const p = people().find(x => x.id === g.personId); if (!p) return;
    out.push({kind:'gift', id:g.personId, title:g.title,
      sub:`${g.dir === 'in' ? 'nhận từ' : 'tặng'} ${p.name} · ${money(g.value)}`,
      color:'var(--tx3)'});
  }});

  return limit ? out.slice(0, limit) : out;
}
const KIND_LABEL = {person:'Người', task:'Việc', idea:'Ý tưởng', card:'Thẻ giao việc',
                    occasion:'Dịp', gift:'Trao đổi', birthday:'Sinh nhật',
                    staffBirthday:'Sinh nhật nhân viên', reminder:'Việc hằng ngày'};

/* ============================================================
   SỔ TIỀN — gom mọi khoản đã ghi trong app về một dòng chảy
   Chi: quà mình tặng, món trả lại, tiền ngoài luồng đã trả cho nhân viên.
   Nhận: quà người khác tặng mình (không phải tiền mặt, chỉ để đối chiếu).
   ============================================================ */
function cashFlow(from, to){
  const out = [], inc = [];
  gifts().forEach(g => {
    const p = people().find(x => x.id === g.personId);
    const who = p ? p.name : '—';
    if (g.dir === 'out' && g.date >= from && g.date <= to && g.value)
      out.push({date:g.date, group:'quan hệ', title:g.title, who, amount:g.value,
                occasion:g.occasion || '', personId:g.personId});
    if (g.repay && g.repay.date >= from && g.repay.date <= to && g.repay.value)
      out.push({date:g.repay.date, group:'quan hệ', title:g.repay.title + ' (trả lại)', who,
                amount:g.repay.value, occasion:g.occasion || '', personId:g.personId});
    if (g.dir === 'in' && g.date >= from && g.date <= to && g.value)
      inc.push({date:g.date, group:'quan hệ', title:g.title, who, amount:g.value,
                occasion:g.occasion || '', personId:g.personId});
  });
  cards().forEach(c => {
    if (c.extra && c.extraPaidDate && c.extraPaidDate >= from && c.extraPaidDate <= to && c.extraPay)
      out.push({date:c.extraPaidDate, group:'nhân viên', title:c.title,
                who:c.assignee || 'chưa giao', amount:c.extraPay, cardId:c.id});
  });
  out.sort((a,b) => b.date.localeCompare(a.date));
  inc.sort((a,b) => b.date.localeCompare(a.date));
  const sum = a => a.reduce((s,x) => s + x.amount, 0);
  return {
    out, inc,
    totalOut: sum(out),
    totalIn: sum(inc),
    outRelation: sum(out.filter(x => x.group === 'quan hệ')),
    outStaff: sum(out.filter(x => x.group === 'nhân viên'))
  };
}
const monthRange = ym => [ym + '-01', addDays(addMonths(ym + '-01', 1), -1)];
function monthFlow(ym){ const [a,b] = monthRange(ym); return cashFlow(a,b); }
function prevMonth(ym){ return addMonths(ym + '-01', -1).slice(0,7); }
function shiftMonth(ym, n){ return addMonths(ym + '-01', n).slice(0,7); }

/* ============================================================
   CÂN BẰNG GIỮA CÁC MẢNG
   Đếm "lượt chạm" trong N ngày qua: việc hoàn thành, thẻ giao việc
   được động tới, ghi nhật ký với người thuộc mảng đó.
   ============================================================ */
function areaStats(days){
  const win = addDays(today(), -(days || 7));
  const rows = areas().map(a => ({area:a, touch:0, open:0, late:0, last:null}));
  const other = {area:{id:'', name:'Chưa gắn mảng', color:'var(--tx3)'}, touch:0, open:0, late:0, last:null};
  const find = id => rows.find(r => r.area.id === id) || other;
  const hit = (id, date) => {
    const r = find(id); r.touch++;
    if (date && (!r.last || date > r.last)) r.last = date;
  };

  tasks().forEach(t => {
    if (!t.done) { find(t.areaId).open++; if (t.due && dayDiff(t.due) < 0) find(t.areaId).late++; }
    const log = t.doneLog || (t.doneAt ? [t.doneAt] : []);
    log.forEach(d => { if (d >= win) hit(t.areaId, d); });
  });
  cards().forEach(c => {
    const upd = (c.updatedAt || '').slice(0,10);
    if (c.col !== 'done'){ find(c.areaId).open++; if (c.due && dayDiff(c.due) < 0) find(c.areaId).late++; }
    if (upd >= win) hit(c.areaId, upd);
  });
  people().forEach(p => (p.logs||[]).forEach(l => { if (l.date >= win) hit(p.areaId, l.date); }));

  const all = rows.concat(other.touch || other.open ? [other] : []);
  const total = all.reduce((s,r) => s + r.touch, 0);
  all.forEach(r => {
    r.pct  = total ? Math.round(r.touch/total*100) : 0;
    r.idle = r.last ? -dayDiff(r.last) : null;      // số ngày chưa đụng tới
  });
  return {rows:all, total, days:days || 7};
}
