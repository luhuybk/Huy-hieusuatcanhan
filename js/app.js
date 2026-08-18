/* ============================================================
   app.js — trạng thái giao diện, biểu mẫu, điều phối sự kiện
   ============================================================ */
"use strict";

const S = { view:'dash', q:'', personId:null, staffId:null, ideatab:'live', assignee:'all', area:'all', side:false,
            calMonth: today().slice(0,7), calDay: today(), moneyMonth: today().slice(0,7) };

const TITLES = {
  dash:['Tổng quan','Việc và người cần chú ý hôm nay'],
  inbox:['Hộp ghi nhanh','Ghi trước, phân loại sau'],
  money:['Sổ tiền','Chi cho quan hệ và nhân viên'],
  calendar:['Lịch tháng','Việc, dịp và sinh nhật trên một lịch'],
  people:['Quan hệ','Năm vòng tròn: S · S2 · A · B · C'],
  occasions:['Dịp & lễ','Giỗ, Tết, kỷ niệm — có tính âm lịch'],
  work:['Công việc','Việc cần làm, có cả việc lặp lại'],
  ideas:['Ý tưởng','Nghĩ gì ghi đó — kèm hướng triển khai'],
  board:['Giao việc','Bảng tiến độ nhân viên'],
  review:['Ôn lại tuần','Nhìn lại 7 ngày qua'],
  settings:['Cài đặt','Dữ liệu, nhắc nhở, đồng bộ']
};

/* ---------------- render ---------------- */
/* Chỉ cuộn lên đầu khi thật sự đổi màn hình. Nếu vẫn đang ở cùng màn
   (tick một ô, đánh dấu đã trả…) thì giữ nguyên chỗ đang xem. */
let _renderKey = '';
function render(){
  const v = S.view;
  const key = v + ':' + (S.personId || '') + ':' + (S.staffId || '');
  const keepScroll = key === _renderKey;
  const y = window.scrollY;
  _renderKey = key;
  let html;
  try {
    if (v === 'dash')          html = vDash();
    else if (v === 'people')   html = vPeople();
    else if (v === 'person')   html = vPerson();
    else if (v === 'work')     html = vWork();
    else if (v === 'ideas')    html = vIdeas();
    else if (v === 'board')    html = vBoard();
    else if (v === 'review')   html = vReview();
    else if (v === 'occasions')html = vOccasions();
    else if (v === 'calendar') html = vCalendar();
    else if (v === 'inbox')    html = vInbox();
    else if (v === 'staff')    html = vStaff();
    else if (v === 'money')    html = vMoney();
    else                       html = vSettings();
  } catch(e){ panic(e); return; }
  $('#view').innerHTML = html;
  try { renderSide(); } catch(e){}

  if (v === 'staff'){
    const s2 = staff().find(x => x.id === S.staffId);
    $('#ttl').innerHTML = `<span data-act="nav" data-id="board" style="color:var(--acc);margin-right:6px;cursor:pointer">‹</span>${esc(s2 ? s2.name : '')}`;
    $('#sub').textContent = s2 ? (s2.role || 'Nhân sự') : '';
  } else if (v === 'person'){
    const p = people().find(x => x.id === S.personId);
    $('#ttl').innerHTML = `<span data-act="nav" data-id="people" style="color:var(--acc);margin-right:6px;cursor:pointer">‹</span>${esc(p?p.name:'')}`;
    $('#sub').textContent = p ? TIERS[p.tier].name : '';
  } else {
    $('#ttl').textContent = TITLES[v][0];
    const a = areaOf(S.area);
    $('#sub').textContent = TITLES[v][1] + (a && v !== 'people' && v !== 'settings' ? ' · lọc: ' + a.name : '');
  }
  $('#fab').style.display = ['person','staff','settings','review','occasions','calendar','money'].includes(v) ? 'none' : 'grid';

  const q = $('#q');
  if (q) q.oninput = e => {
    S.q = e.target.value; const pos = e.target.selectionStart;
    render(); const n = $('#q'); if (n){ n.focus(); n.setSelectionRange(pos,pos); }
  };
  window.scrollTo({top: keepScroll ? y : 0});
}
window.render = render;

function setSide(open){
  S.side = open;
  $('#side').classList.toggle('open', open);
  $('#scrim').classList.toggle('on', open);
}

/* ---------------- biểu mẫu ---------------- */
function closeModal(){ Voice.stop(); $('#modals').innerHTML = ''; }

function openForm({title, fields, values = {}, submit = 'Lưu', onSave, extra, top}){
  const html = fields.map(f => {
    const v = values[f.k] != null ? values[f.k] : (f.def != null ? f.def : '');
    let inp;
    if (f.type === 'textarea')      inp = `<textarea id="f_${f.k}" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea>`;
    else if (f.type === 'select')   inp = `<select id="f_${f.k}">` + f.opts.map(o =>
        `<option value="${esc(o[0])}"${String(o[0])===String(v)?' selected':''}>${esc(o[1])}</option>`).join('') + `</select>`;
    else if (f.type === 'money')    inp = `<input id="f_${f.k}" inputmode="text" placeholder="${esc(f.ph||'vd: 300k, 1tr2, 250000')}" value="${v?esc(String(v)):''}">`;
    else if (f.type === 'number')   inp = `<input id="f_${f.k}" type="number" inputmode="numeric" placeholder="${esc(f.ph||'')}" value="${esc(v)}">`;
    else if (f.type === 'date')     inp = `<input id="f_${f.k}" type="date" value="${esc(String(v).slice(0,10))}">`;
    else if (f.type === 'color')    inp = `<input id="f_${f.k}" type="color" value="${esc(v||'#5b8cff')}" style="height:44px;padding:4px">`;
    else if (f.type === 'tel')      inp = `<input id="f_${f.k}" type="tel" inputmode="tel" placeholder="${esc(f.ph||'')}" value="${esc(v)}">`;
    else if (f.type === 'time')     inp = `<input id="f_${f.k}" type="time" value="${esc(v || '')}">`;
    else if (f.type === 'days'){
      const sel = Array.isArray(v) ? v.map(Number) : [];
      inp = `<div class="wdays" id="f_${f.k}">` + WDAYS.map(([n, lbl]) =>
        `<button type="button" data-pk="${n}" class="${sel.includes(n)?'on':''}">${lbl}</button>`).join('') + `</div>`;
    }
    else if (f.type === 'people' || f.type === 'multi'){
      const sel = Array.isArray(v) ? v : [];
      const opts = f.type === 'people' ? people().map(p => [p.id, p.name]) : (f.opts || []);
      inp = `<div class="pick" id="f_${f.k}">` + (opts.length
        ? opts.map(o => `<button type="button" data-pk="${esc(o[0])}" class="${sel.includes(o[0])?'on':''}">${esc(o[1])}</button>`).join('')
        : `<span class="dim">Chưa có mục nào để chọn.</span>`) + `</div>`;
    }
    else                            inp = `<input id="f_${f.k}" type="text" placeholder="${esc(f.ph||'')}" value="${esc(v)}">`;
    const mic = f.voice && Voice.supported()
      ? `<button type="button" class="mic" data-mic="f_${f.k}" title="Đọc thành chữ">🎤</button>` : '';
    return `<div class="f ${f.half?'half':''}"><label class="${mic?'miclbl':''}">${esc(f.label)}${mic}</label>${inp}${
      f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
  }).join('');

  $('#modals').innerHTML = `
    <div class="ov" data-ovclose>
      <form class="sheet" id="theform">
        <h2>${esc(title)}</h2>
        ${top || ''}
        <div class="fgrid">${html}</div>
        ${extra || ''}
        <div class="btns" style="margin-top:4px">
          <button type="submit" class="btn pri grow">${esc(submit)}</button>
          <button type="button" class="btn" data-close>Huỷ</button>
        </div>
      </form>
    </div>`;

  /* chọn nhiều người + nút micro */
  $('#theform').addEventListener('click', e => {
    const pk = e.target.closest('[data-pk]');
    if (pk){ e.preventDefault(); pk.classList.toggle('on'); return; }
    const mic = e.target.closest('[data-mic]');
    if (mic){ e.preventDefault(); Voice.toggle(document.getElementById(mic.dataset.mic)); }
  });

  $('#theform').addEventListener('submit', e => {
    e.preventDefault();
    Voice.stop();
    const out = {};
    for (const f of fields){
      const el = document.getElementById('f_' + f.k);
      if (f.type === 'people' || f.type === 'multi'){
        out[f.k] = Array.from(el.querySelectorAll('.on')).map(b => b.dataset.pk);
        continue;
      }
      if (f.type === 'days'){
        out[f.k] = Array.from(el.querySelectorAll('.on')).map(b => +b.dataset.pk);
        continue;
      }
      let v = el.value.trim();
      if (f.type === 'money')  v = parseMoney(v);
      if (f.type === 'number') v = v === '' ? 0 : +v;
      out[f.k] = v;
    }
    if (fields[0] && !out[fields[0].k] && fields[0].req !== false){
      toast('Cần nhập ' + fields[0].label.toLowerCase()); return;
    }
    closeModal(); onSave(out);
  });
}
function confirmBox(text, onYes, label){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
      <h2>${esc(text)}</h2>
      <div class="btns"><button class="btn dngr grow" id="yes">${esc(label||'Xoá')}</button>
      <button class="btn" data-close>Huỷ</button></div></div></div>`;
  $('#yes').onclick = () => { closeModal(); onYes(); };
}
const areaOpts = () => [['','— không thuộc mảng nào —'], ...areas().map(a => [a.id, a.name])];

/* ---------------- người ---------------- */
const personFields = () => [
  {k:'name',  label:'Tên', half:true},
  {k:'tier',  label:'Nhóm', type:'select', half:true, opts:TIER_KEYS.map(k => [k, `${k} · ${TIERS[k].name}`])},
  {k:'phone', label:'Điện thoại', type:'tel', half:true},
  {k:'birthday', label:'Sinh nhật', type:'date', half:true},
  {k:'tags',  label:'Nhãn', half:true, ph:'đồng nghiệp, hàng xóm…'},
  {k:'areaId',label:'Thuộc mảng', type:'select', half:true, opts:areaOpts()},
  {k:'note',  label:'Ghi chú', type:'textarea', voice:true, ph:'sở thích, con cái, điều cần nhớ…'},
  {k:'lastContact', label:'Lần liên lạc gần nhất', type:'date', half:true}
];
function addPerson(){
  openForm({title:'Thêm người', fields:personFields(), values:{tier:'B', lastContact:today()},
    onSave(v){
      const p = stamp(Object.assign({logs:[], history:[{date:today(), from:null, to:v.tier}]}, v));
      db.people.push(p); save(); render(); toast('Đã thêm ' + p.name);
    }});
}
function editPerson(id){
  const p = db.people.find(x => x.id === id);
  openForm({title:'Sửa thông tin', fields:personFields(), values:p, onSave(v){
    if (v.tier !== p.tier){ p.history = p.history || []; p.history.push({date:today(), from:p.tier, to:v.tier}); }
    Object.assign(p, v); stamp(p); save(); render();
  }});
}
function quickLog(pid){
  const p = db.people.find(x => x.id === pid);
  openForm({title:'Ghi nhật ký · ' + p.name, submit:'Lưu',
    top:`<div class="dim" style="margin:-8px 0 12px">Một dòng thôi cũng được. Sau này nhìn lại sẽ nhớ mình đã ở đâu với ai.${
      Voice.supported() ? ' Bấm 🎤 để đọc thay vì gõ.' : ''}</div>`,
    fields:[
      {k:'kind', label:'Kiểu', type:'select', half:true, opts:Object.entries(LOG_KINDS)},
      {k:'date', label:'Ngày', type:'date', half:true},
      {k:'text', label:'Nội dung', type:'textarea', req:false, voice:true,
       ph:'cà phê ở quán cũ, nó kể chuyện mở tiệm…'}
    ],
    values:{kind:'meet', date:today()},
    onSave(v){
      p.logs = p.logs || [];
      p.logs.push({id:uid(), kind:v.kind, date:v.date, text:v.text});
      if (!p.lastContact || v.date > p.lastContact) p.lastContact = v.date;
      stamp(p); save(); render(); toast('Đã ghi vào nhật ký');
    }});
}
function chTier(id){
  const p = db.people.find(x => x.id === id);
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Chuyển nhóm cho ${esc(p.name)}</h2>` +
    TIER_KEYS.map(k => `<div class="item" data-act="setTier" data-id="${id}" data-t="${k}">
      <div class="av" style="background:${TIERS[k].color}">${k}</div>
      <div class="grow"><div class="t">${TIERS[k].name}</div><div class="s">${esc(TIERS[k].desc)}</div></div>
      ${p.tier===k?'<span class="chip ok">hiện tại</span>':''}</div>`).join('') +
    `<button class="btn full" data-close>Đóng</button></div></div>`;
}

/* ---------------- trao đổi ---------------- */
function addGift(pid, dir){
  openForm({title: dir === 'in' ? 'Họ trao cho mình' : 'Mình trao cho họ',
    fields:[
      {k:'title', label:'Món / việc', ph:'giỏ quà Tết, cho mượn xe…'},
      {k:'value', label:'Giá trị ước tính', type:'money', half:true},
      {k:'date',  label:'Ngày', type:'date', half:true},
      {k:'occasion', label:'Dịp', ph:'sinh nhật, đám cưới, Tết…'},
      {k:'note',  label:'Ghi chú', type:'textarea'}
    ],
    values:{date:today()},
    onSave(v){
      db.gifts.push(stamp(Object.assign({personId:pid, dir:dir, repay:null}, v)));
      const p = db.people.find(x => x.id === pid);
      if (p && (!p.lastContact || v.date > p.lastContact)){ p.lastContact = v.date; stamp(p); }
      save(); render(); toast('Đã ghi nhận');
    }});
}
function repay(gid){
  const g = db.gifts.find(x => x.id === gid);
  if (g.repay){
    confirmBox('Bỏ đánh dấu "đã trả lại"?', () => { g.repay = null; stamp(g); save(); render(); }, 'Bỏ đánh dấu');
    return;
  }
  openForm({title:'Mình đã trả lại gì?',
    top:`<div class="dim" style="margin:-8px 0 12px">Đối ứng cho <b>${esc(g.title)}</b> — ${money(g.value)}</div>`,
    fields:[
      {k:'title', label:'Món trả lại', ph:'hộp bánh, bao lì xì…'},
      {k:'value', label:'Giá trị', type:'money', half:true},
      {k:'date',  label:'Ngày trả', type:'date', half:true}
    ],
    values:{date:today(), value:g.value},
    onSave(v){ g.repay = v; stamp(g); save(); render(); toast('Đã cân bằng ✓'); }});
}
function giftMenu(gid){
  const g = db.gifts.find(x => x.id === gid);
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>${esc(g.title)}</h2>
    <div class="btns" style="flex-direction:column">
      <button class="btn full" data-act="editGift" data-id="${gid}">Sửa</button>
      ${g.dir==='in' ? `<button class="btn full" data-act="repay" data-id="${gid}">${g.repay?'Bỏ đánh dấu đã trả':'Đánh dấu đã trả lại'}</button>` : ''}
      <button class="btn full dngr" data-act="delGift" data-id="${gid}">Xoá</button>
      <button class="btn full" data-close>Đóng</button></div></div></div>`;
}
function editGift(gid){
  const g = db.gifts.find(x => x.id === gid);
  openForm({title:'Sửa ghi nhận', fields:[
      {k:'title', label:'Món / việc'},
      {k:'value', label:'Giá trị', type:'money', half:true},
      {k:'date',  label:'Ngày', type:'date', half:true},
      {k:'occasion', label:'Dịp'},
      {k:'note',  label:'Ghi chú', type:'textarea'}
    ], values:g, onSave(v){ Object.assign(g, v); stamp(g); save(); render(); }});
}

/* ---------------- việc cần làm ---------------- */
const taskFields = () => [
  {k:'title', label:'Việc cần làm'},
  {k:'areaId',label:'Mảng việc', type:'select', half:true, opts:areaOpts()},
  {k:'due',   label:'Hạn', type:'date', half:true},
  {k:'repeat',label:'Lặp lại', type:'select', half:true, opts:Object.entries(REPEATS)},
  {k:'prio',  label:'Ưu tiên', type:'select', half:true, opts:Object.entries(PRIO), def:'mid'},
  {k:'remindAt', label:'Nhắn Telegram lúc', type:'time', half:true,
   hint:'đúng ngày hạn, để trống thì không nhắn'},
  {k:'remindBefore', label:'Báo trước (ngày)', type:'number', half:true, ph:'0',
   hint:'thêm một tin sớm cho việc lớn; 0 = chỉ nhắc đúng ngày hạn'},
  {k:'note',  label:'Ghi chú', type:'textarea'}
];
/* ô số nhập tay nên có thể ra số âm hoặc số vô lý — chặn ngay tại đây */
function normalizeTask(v){
  v.remindBefore = Math.max(0, Math.min(60, +v.remindBefore || 0));
  return v;
}
function addTask(due){
  openForm({title:'Việc cần làm', fields:taskFields(),
    values:{prio:'mid', areaId:S.area==='all'?'':S.area, due: due || ''},
    onSave(v){
      normalizeTask(v);
      db.tasks.push(stamp(Object.assign({done:false, streak:0, bestStreak:0, doneLog:[], createdAt:today()}, v)));
      save();
      if (S.view !== 'calendar') S.view = 'work';
      render();
    }});
}
function editTask(id){
  const t = db.tasks.find(x => x.id === id);
  openForm({title:'Sửa việc', fields:taskFields(), values:t,
    extra:`${t.bestStreak>1?`<div class="dim" style="margin-bottom:10px">Chuỗi hiện tại ${t.streak||0} · kỷ lục ${t.bestStreak}</div>`:''}
      <button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delTask" data-id="${id}">Xoá việc này</button>`,
    onSave(v){ Object.assign(t, normalizeTask(v)); stamp(t); save(); render(); }});
}
function toggleTask(id){
  const t = db.tasks.find(x => x.id === id);
  /* Xong rồi thì mốc dời nhắc phải bỏ luôn. Việc lặp lại không bao giờ mang
     cờ done, nên mốc cũ còn sót lại là máy chủ vẫn bắn tin "đến giờ dời"
     cho việc mình vừa tick xong. Nút Xong trên Telegram xưa nay đã xoá
     trường này rồi — bên app phải làm y hệt. */
  if (!t.done) t.snoozeUntil = '';
  if (t.done){ t.done = false; t.doneAt = null; }
  else if (t.repeat){
    const onTime = !t.due || dayDiff(t.due) >= 0;
    t.streak = (onTime ? (t.streak||0) : 0) + 1;
    t.bestStreak = Math.max(t.bestStreak||0, t.streak);
    t.doneLog = (t.doneLog||[]).concat(today()).slice(-80);
    t.doneAt = today();
    t.due = nextRepeat(t.due || today(), t.repeat);
    toast('Xong kỳ này · lần tới ' + fmtDate(t.due) + (t.streak > 1 ? ` · chuỗi ${t.streak} 🔥` : ''));
  } else { t.done = true; t.doneAt = today(); t.doneLog = (t.doneLog||[]).concat(today()); }
  stamp(t); save(); render();
}

/* ---------------- dời nhắc ----------------
   Dùng chung cho việc cần làm và thẻ giao việc. Bấm dời ở đây hay bấm nút
   ⏰ dưới tin Telegram đều ghi vào cùng một trường snoozeUntil, nên hai bên
   luôn thấy giống nhau sau lượt đồng bộ kế tiếp.
   Bốn mức này phải khớp SNOOZE_MINS trong api/lib.php. */
const SNOOZE = [[240,'4 giờ'], [720,'12 giờ'], [1440,'1 ngày'], [4320,'3 ngày']];

/* Giờ địa phương chứ KHÔNG phải ISO/UTC: máy chủ đọc chuỗi này theo giờ VN,
   đổi sang UTC là lệch bảy tiếng, nhắc sai hẳn buổi. */
const snoozeStamp = ms => { const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
function snoozeDate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]) : null;
}
const snoozeOn = o => { const d = snoozeDate(o && o.snoozeUntil); return !!d && d > new Date(); };
function snoozeText(s){
  const d = snoozeDate(s); if (!d) return '';
  const midnight = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((midnight(d) - midnight(new Date())) / 86400000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` +
    (dd === 0 ? '' : dd === 1 ? ' mai' : ` ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`);
}
const snoozeItem = (kind, id) => (kind === 'cards' ? db.cards : db.tasks).find(x => x.id === id);

function snoozeBox(kind, id){
  const it = snoozeItem(kind, id); if (!it) return;
  const on = snoozeOn(it);
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Dời nhắc</h2>
    <div class="dim" style="margin:-8px 0 14px;line-height:1.65">
      <b>${esc(it.title || '')}</b><br>
      ${on ? `Đang dời tới <b>${esc(snoozeText(it.snoozeUntil))}</b>. Chọn mức khác để dời tiếp.`
           : 'Chỉ dời <b>lời nhắc</b>, hạn chót giữ nguyên — việc trễ vẫn hiện là trễ.'}
    </div>
    <div class="btns" style="flex-wrap:wrap">
      ${SNOOZE.map(([m, l]) =>
        `<button class="btn grow" data-act="snzSet" data-k="${esc(kind)}" data-id="${esc(id)}" data-m="${m}">⏰ ${esc(l)}</button>`).join('')}
    </div>
    ${on ? `<button class="btn full dngr" style="margin-top:10px"
              data-act="snzSet" data-k="${esc(kind)}" data-id="${esc(id)}" data-m="0">Bỏ dời</button>` : ''}
    <button class="btn full" style="margin-top:10px" data-close>Đóng</button>
  </div></div>`;
}
function snoozeApply(kind, id, mins){
  const it = snoozeItem(kind, id); if (!it) return;
  it.snoozeUntil = mins > 0 ? snoozeStamp(Date.now() + mins * 60000) : '';
  stamp(it); save(); closeModal(); render();
  toast(mins > 0 ? 'Nhắc lại lúc ' + snoozeText(it.snoozeUntil) : 'Đã bỏ dời');
}

/* ---------------- ý tưởng ---------------- */
/* Ô "nhắc xem lại" nhận mã khoảng cách (m3, y1…) chứ không nhận ngày, vì
   người ta nghĩ theo kiểu "ba tháng nữa tính tiếp" chứ không nhớ nổi ngày
   cụ thể. Ý tưởng đang có hẹn thì thêm lựa chọn giữ nguyên ngày cũ, không
   thì mỗi lần sửa tên là ngày hẹn bị đặt lại. */
function reviewOpts(i){
  const keep = i && String(i.reviewAt || '').slice(0,10);
  return (keep ? [['keep', 'Giữ ngày ' + fmtDate(keep)]] : [])
         .concat([['', 'Không nhắc']], REVIEW_IN);
}
const ideaFields = i => [
  {k:'title',  label:'Ý tưởng'},
  {k:'areaId', label:'Mảng việc', type:'select', half:true, opts:areaOpts()},
  {k:'status', label:'Trạng thái', type:'select', half:true, opts:Object.entries(IDEA_ST), def:'seed'},
  {k:'reviewIn', label:'Nhắc xem lại', type:'select', opts:reviewOpts(i),
   hint:'tới ngày đó Telegram hỏi lại: làm hay bỏ'},
  {k:'detail', label:'Nội dung', type:'textarea', voice:true, ph:'ý tưởng này là gì, giải quyết vấn đề gì'},
  {k:'plan',   label:'Hướng triển khai', type:'textarea', voice:true, ph:'bước 1…\nbước 2…'}
];
/* đổi lựa chọn trong ô thành ngày thật, rồi bỏ trường tạm đi */
function applyReview(v, i){
  const pick = v.reviewIn;
  delete v.reviewIn;
  if (pick === 'keep') { if (i) v.reviewAt = i.reviewAt || ''; return v; }
  v.reviewAt = pick ? reviewDate(pick) : '';
  return v;
}
function addIdea(){
  openForm({title:'Ý tưởng mới', fields:ideaFields(null),
    values:{status:'seed', reviewIn:'', areaId:S.area==='all'?'':S.area},
    onSave(v){ db.ideas.push(stamp(Object.assign({createdAt:today()}, applyReview(v, null))));
      save(); S.view='ideas'; S.ideatab='live'; render(); }});
}
function editIdea(id){
  const i = db.ideas.find(x => x.id === id);
  openForm({title:'Sửa ý tưởng', fields:ideaFields(i),
    values:Object.assign({}, i, {reviewIn: i.reviewAt ? 'keep' : ''}),
    extra:`<button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delIdea" data-id="${id}">Xoá ý tưởng</button>
      <button type="button" class="btn full" style="margin-bottom:10px" data-act="ideaToCard" data-id="${id}">→ Đưa lên bảng giao việc</button>`,
    onSave(v){ Object.assign(i, applyReview(v, i)); stamp(i); save(); render(); }});
}
/* Ba nút trên thẻ ý tưởng tới hẹn — cùng bộ với ba nút dưới tin Telegram,
   bấm bên nào cũng ghi vào cùng một chỗ. */
function ideaReview(id, act){
  const i = db.ideas.find(x => x.id === id); if (!i) return;
  if (act === 'go')        { i.status = 'doing'; i.reviewAt = ''; toast('Bắt tay làm: ' + i.title); }
  else if (act === 'drop') { i.status = 'drop';  i.reviewAt = ''; toast('Đã gác lại: ' + i.title); }
  else                     { i.reviewAt = reviewDate(act); toast('Hẹn xem lại ' + fmtDate(i.reviewAt)); }
  stamp(i); save(); render();
}

/* ---------------- thẻ giao việc ---------------- */
const cardFields = () => [
  {k:'title', label:'Đầu việc'},
  {k:'assignee', label:'Giao cho', type:'select', half:true,
    opts:[['','— chưa giao —'], ...[...new Set([...staff().map(s=>s.name), ...cards().map(c=>c.assignee).filter(Boolean)])].map(n=>[n,n])]},
  {k:'col',   label:'Cột', type:'select', half:true, opts:COLS.map(c=>[c.id,c.label])},
  {k:'areaId',label:'Mảng việc', type:'select', half:true, opts:areaOpts()},
  {k:'due',   label:'Hạn chót', type:'date', half:true},
  {k:'remindAt', label:'Nhắn Telegram lúc', type:'time', half:true,
   hint:'đúng ngày hạn chót, để trống thì không nhắn'},
  {k:'remindBefore', label:'Báo trước (ngày)', type:'number', half:true, ph:'0',
   hint:'thêm một tin sớm cho việc lớn; 0 = chỉ nhắc đúng hạn'},
  {k:'prio',  label:'Ưu tiên', type:'select', half:true, opts:Object.entries(PRIO), def:'mid'},
  {k:'progress', label:'Tiến độ (%)', type:'number', half:true, ph:'0-100'},
  {k:'extra', label:'Loại việc', type:'select', half:true,
    opts:[['','Trong nhiệm vụ'], ['yes','Ngoài luồng — cần chi thêm']]},
  {k:'extraPay', label:'Tiền công / thưởng thêm', type:'money', half:true,
    hint:'chỉ dùng khi là việc ngoài luồng'},
  {k:'extraPaidDate', label:'Ngày đã chi trả', type:'date', half:true,
    hint:'để trống nghĩa là chưa trả'},
  {k:'desc',  label:'Mô tả / yêu cầu', type:'textarea', voice:true}
];
/* select trả về chuỗi, chuẩn hoá lại trước khi lưu */
function normalizeCard(v, prev){
  v.extra = v.extra === 'yes' || v.extra === true;
  /* mốc hoàn thành: chỉ đặt lần đầu chuyển sang cột Hoàn thành */
  if (v.col === 'done') v.doneAt = (prev && prev.doneAt) || v.doneAt || today();
  else v.doneAt = '';
  if (!v.extra){ v.extraPay = 0; v.extraPaidDate = ''; }
  v.progress = Math.max(0, Math.min(100, +v.progress || 0));
  v.remindBefore = Math.max(0, Math.min(60, +v.remindBefore || 0));
  return v;
}
function addCard(col){
  openForm({title:'Thẻ việc mới', fields:cardFields(),
    values:{col:col||'idea', prio:'mid', progress:0, areaId:S.area==='all'?'':S.area,
            assignee: S.assignee!=='all' ? S.assignee : '', extra:'', extraPay:0, extraPaidDate:''},
    onSave(v){ db.cards.push(stamp(Object.assign({checklist:[], createdAt:today()}, normalizeCard(v))));
               save(); render(); }});
}
function openCard(id){
  const c = db.cards.find(x => x.id === id);
  const i = COLS.findIndex(x => x.id === c.col);
  openForm({title:'Thẻ việc', fields:cardFields(),
    values:Object.assign({}, c, {extra: c.extra ? 'yes' : ''}),
    extra:`<div class="btns" style="margin-bottom:10px">
        ${i>0 ? `<button type="button" class="btn sm grow" data-act="mv" data-id="${id}" data-d="-1">‹ ${esc(COLS[i-1].label)}</button>`:''}
        ${i<COLS.length-1 ? `<button type="button" class="btn sm grow" data-act="mv" data-id="${id}" data-d="1">${esc(COLS[i+1].label)} ›</button>`:''}
      </div>
      <button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delCard" data-id="${id}">Xoá thẻ</button>`,
    onSave(v){ Object.assign(c, normalizeCard(v, c)); stamp(c); save(); render(); }});
}

/* ---------------- hộp ghi nhanh ---------------- */
function quickCapture(){
  const mic = Voice.supported()
    ? `<button type="button" class="mic" id="capmic" title="Đọc thành chữ">🎤</button>` : '';
  const recent = inboxOpen().slice(0,3);
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Ghi nhanh</h2>
    <div class="dim" style="margin:-8px 0 12px">Chỉ cần một câu. Enter để lưu, Shift+Enter xuống dòng.${
      Voice.supported() ? ' Hoặc bấm 🎤 nói.' : ''}</div>
    <div class="f"><label class="${mic?'miclbl':''}">Nội dung${mic}</label>
      <textarea id="cap" placeholder="mua sáp cho tiệm · hỏi Nam về lô hàng · ý tưởng lớp tập sáng…"
        style="min-height:96px"></textarea></div>
    <div class="btns">
      <button class="btn pri grow" data-act="capSave">Lưu</button>
      <button class="btn" data-act="capMore">Lưu &amp; ghi tiếp</button>
      <button class="btn" data-close>Đóng</button>
    </div>
    ${recent.length ? `<div class="dim" style="margin-top:14px;line-height:1.7">
      Đang chờ phân loại:<br>${recent.map(n =>
        '· ' + esc((n.text||'').split('\n')[0])).join('<br>')}</div>` : ''}
  </div></div>`;

  const ta = $('#cap');
  if (mic) $('#capmic').onclick = () => Voice.toggle(ta);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); saveCapture(false); }
  });
  setTimeout(() => ta.focus(), 60);
}
function saveCapture(keepOpen){
  const ta = $('#cap'); if (!ta) return;
  const text = ta.value.trim();
  if (!text){ toast('Chưa có gì để lưu'); return; }
  Voice.stop();
  db.inbox.push(stamp({text, processed:false, processedAs:'', createdAt:now()}));
  save();
  if (keepOpen){ ta.value = ''; ta.focus(); renderSide(); toast('Đã ghi · tiếp tục'); }
  else { closeModal(); render(); toast('Đã ghi vào hộp'); }
}

/* chuyển một mẩu ghi thành thứ đúng loại */
function inboxTo(kind, id){
  const n = db.inbox.find(x => x.id === id); if (!n) return;
  const lines = (n.text || '').split('\n');
  const first = lines[0].trim();
  const body  = lines.slice(1).join('\n').trim();
  const finish = as => { n.processed = true; n.processedAs = as; stamp(n); save(); render(); };

  if (kind === 'task'){
    openForm({title:'Chuyển thành việc cần làm', fields:taskFields(),
      values:{title:first, note:body, prio:'mid', areaId:S.area === 'all' ? '' : S.area},
      onSave(v){
        db.tasks.push(stamp(Object.assign({done:false, streak:0, bestStreak:0, doneLog:[], createdAt:today()}, v)));
        finish('việc cần làm'); toast('Đã tạo việc');
      }});
  }
  else if (kind === 'idea'){
    openForm({title:'Chuyển thành ý tưởng', fields:ideaFields(null),
      values:{title:first, detail:body, status:'seed', reviewIn:'',
              areaId:S.area === 'all' ? '' : S.area},
      onSave(v){
        db.ideas.push(stamp(Object.assign({createdAt:today()}, applyReview(v, null))));
        finish('ý tưởng'); toast('Đã tạo ý tưởng');
      }});
  }
  else if (kind === 'card'){
    openForm({title:'Chuyển thành thẻ giao việc', fields:cardFields(),
      values:{title:first, desc:body, col:'idea', prio:'mid', progress:0,
              areaId:S.area === 'all' ? '' : S.area, extra:'', extraPay:0, extraPaidDate:''},
      onSave(v){
        db.cards.push(stamp(Object.assign({checklist:[], createdAt:today()}, normalizeCard(v))));
        finish('thẻ giao việc'); toast('Đã đưa lên bảng giao việc');
      }});
  }
  else if (kind === 'log'){
    if (!people().length){ toast('Chưa có ai trong danh bạ'); return; }
    openForm({title:'Chuyển thành nhật ký gặp gỡ',
      fields:[
        {k:'personId', label:'Với ai', type:'select', opts:people().map(p => [p.id, p.name])},
        {k:'kind', label:'Kiểu', type:'select', half:true, opts:Object.entries(LOG_KINDS)},
        {k:'date', label:'Ngày', type:'date', half:true},
        {k:'text', label:'Nội dung', type:'textarea', req:false, voice:true}
      ],
      values:{kind:'meet', date:(n.createdAt||'').slice(0,10) || today(), text:n.text},
      onSave(v){
        const p = db.people.find(x => x.id === v.personId); if (!p) return;
        p.logs = p.logs || [];
        p.logs.push({id:uid(), kind:v.kind, date:v.date, text:v.text});
        if (!p.lastContact || v.date > p.lastContact) p.lastContact = v.date;
        stamp(p); finish('nhật ký'); toast('Đã ghi vào nhật ký của ' + p.name);
      }});
  }
}

/* ---------------- dịp & lễ ---------------- */
const occFields = () => [
  {k:'title', label:'Tên dịp', ph:'Giỗ ông nội, Kỷ niệm cưới…'},
  {k:'cal',   label:'Loại lịch', type:'select', half:true,
    opts:[['solar','Dương lịch'], ['lunar','Âm lịch (giỗ, Tết…)']]},
  {k:'remind',label:'Nhắc trước (ngày)', type:'number', half:true},
  {k:'day',   label:'Ngày', type:'number', half:true, ph:'1-31'},
  {k:'month', label:'Tháng', type:'number', half:true, ph:'1-12'},
  {k:'personIds', label:'Người liên quan', type:'people'},
  {k:'note',  label:'Ghi chú', type:'textarea', voice:true, ph:'năm ngoái làm ở nhà bác cả…'}
];
function occPreview(v){
  const d = Math.max(1, Math.min(31, +v.day || 1)), m = Math.max(1, Math.min(12, +v.month || 1));
  const iso = v.cal === 'lunar' ? nextLunarDate(d, m) : nextSolarDate(d, m);
  return iso ? `Lần tới rơi vào ${fmtDate(iso)} (còn ${dayDiff(iso)} ngày)` : 'Không tính được ngày này';
}
function addOcc(preset){
  const base = Object.assign({cal:'solar', remind:7, day:1, month:1, personIds:[]}, preset || {});
  openForm({title: preset ? 'Thêm: ' + preset.title : 'Dịp mới', fields:occFields(), values:base,
    top:`<div class="dim" style="margin:-8px 0 12px">Dịp lặp lại mỗi năm. Chọn âm lịch cho giỗ và Tết —
      app tự quy ra ngày dương từng năm.</div>`,
    onSave(v){
      v.day = Math.max(1, Math.min(31, +v.day || 1));
      v.month = Math.max(1, Math.min(12, +v.month || 1));
      v.remind = Math.max(0, +v.remind || 7);
      db.occasions.push(stamp(v));
      save(); closeModal(); S.view = 'occasions'; render();
      toast(occPreview(v));
    }});
}
function editOcc(id){
  const o = db.occasions.find(x => x.id === id);
  openForm({title:'Sửa dịp', fields:occFields(), values:o,
    top:`<div class="dim" style="margin:-8px 0 12px">${esc(occPreview(o))}</div>`,
    extra:`<button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delOcc" data-id="${id}">Xoá dịp này</button>`,
    onSave(v){
      v.day = Math.max(1, Math.min(31, +v.day || 1));
      v.month = Math.max(1, Math.min(12, +v.month || 1));
      Object.assign(o, v); stamp(o); save(); render();
    }});
}
function presetOcc(){
  const have = occasions().map(o => o.title);
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Lễ & dịp thường gặp</h2>
    <div class="dim" style="margin-bottom:12px">Chọn một dịp để thêm, sau đó gắn người liên quan.</div>
    ${OCCASION_PRESETS.map((p, i) => {
      const n = p.cal === 'lunar' ? nextLunarDate(p.day, p.month) : nextSolarDate(p.day, p.month);
      return `<div class="item" ${have.includes(p.title)?'':`data-act="usePreset" data-id="${i}"`}
        style="${have.includes(p.title)?'opacity:.45':''}">
        <div class="grow"><div class="t">${esc(p.title)}</div>
          <div class="s">${p.cal==='lunar' ? `${p.day}/${p.month} âm` : `${p.day}/${p.month} dương`}${
            n ? ' · lần tới ' + fmtDate(n) : ''}</div></div>
        ${have.includes(p.title) ? '<span class="chip ok">đã có</span>' : '<span class="chip acc">thêm</span>'}
      </div>`;
    }).join('')}
    <button class="btn full" data-close>Đóng</button></div></div>`;
}

/* ---------------- mảng việc ---------------- */
function addArea(){
  openForm({title:'Mảng việc mới',
    top:`<div class="dim" style="margin:-8px 0 12px">Gym, Barbershop, Kinh doanh online, Gia đình…</div>`,
    fields:[
      {k:'name',  label:'Tên mảng', half:true},
      {k:'color', label:'Màu', type:'color', half:true}
    ],
    values:{color: AREA_COLORS[areas().length % AREA_COLORS.length]},
    onSave(v){ db.areas.push(stamp(v)); save(); render(); toast('Đã thêm mảng ' + v.name); }});
}
function areaBox(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Mảng việc</h2>
    ${areas().length ? areas().map(a => `<div class="item">
      <span class="sw" style="width:14px;height:14px;border-radius:4px;background:${esc(a.color)}"></span>
      <div class="grow"><div class="t">${esc(a.name)}</div></div>
      <button class="iconbtn" data-act="editArea" data-id="${a.id}">✎</button>
      <button class="iconbtn" data-act="delArea" data-id="${a.id}">✕</button></div>`).join('')
      : '<div class="empty">Chưa có mảng nào.</div>'}
    <div class="btns" style="margin-top:8px">
      <button class="btn pri grow" data-act="addArea">+ Thêm mảng</button>
      <button class="btn" data-close>Đóng</button></div></div></div>`;
}
function editArea(id){
  const a = db.areas.find(x => x.id === id);
  openForm({title:'Sửa mảng', fields:[
      {k:'name', label:'Tên mảng', half:true},
      {k:'color',label:'Màu', type:'color', half:true}
    ], values:a, onSave(v){ Object.assign(a, v); stamp(a); save(); render(); }});
}

/* ---------------- nhân sự ---------------- */
const staffFields = () => [
  {k:'name', label:'Tên', half:true},
  {k:'role', label:'Vai trò', half:true, ph:'Quản lý gym, Thợ chính…'},
  {k:'phone', label:'Điện thoại', type:'tel', half:true},
  {k:'birthday', label:'Sinh nhật', type:'date', half:true, hint:'để app nhắc tặng quà'},
  {k:'startDate', label:'Bắt đầu làm', type:'date', half:true},
  {k:'areaIds', label:'Phụ trách mảng', type:'multi',
    opts:areas().map(a => [a.id, a.name]), hint:'chọn được nhiều mảng'},
  {k:'note', label:'Ghi chú', type:'textarea', voice:true, ph:'điểm mạnh, điều cần lưu ý…'}
];
function addStaff(){
  openForm({title:'Thêm nhân sự', fields:staffFields(), values:{areaIds:[]},
    onSave(v){ db.staff.push(stamp(v)); save(); render(); toast('Đã thêm ' + v.name); }});
}
function editStaff(id){
  const s = db.staff.find(x => x.id === id);
  const oldName = s.name;
  openForm({title:'Sửa nhân sự', fields:staffFields(), values:s,
    extra:`<button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delStaff" data-id="${id}">Xoá nhân sự</button>`,
    onSave(v){
      Object.assign(s, v); stamp(s);
      /* thẻ việc gắn theo tên, nên đổi tên phải cập nhật luôn các thẻ cũ */
      if (v.name !== oldName){
        let n = 0;
        db.cards.forEach(c => { if (c.assignee === oldName){ c.assignee = v.name; stamp(c); n++; } });
        if (S.assignee === oldName) S.assignee = v.name;
        if (n) toast('Đã đổi tên trên ' + n + ' thẻ việc');
      }
      save(); render();
    }});
}
function staffBox(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Nhân sự</h2>
    ${staff().length ? staff().map(s => `<div class="item">
      <div class="av sm" style="background:var(--acc);color:#fff">${esc(initials(s.name))}</div>
      <div class="grow" data-act="staffPage" data-id="${s.id}">
        <div class="t">${esc(s.name)}</div>
        <div class="s">${esc(s.role||'chưa ghi vai trò')}${
          (s.areaIds||[]).length ? ' · ' + s.areaIds.map(i => (areaOf(i)||{}).name).filter(Boolean).join(', ') : ''}</div></div>
      <button class="iconbtn" data-act="editStaff" data-id="${s.id}" title="Sửa">✎</button>
      <button class="iconbtn" data-act="staffLink" data-id="${s.id}" title="Tạo link cho nhân viên">🔗</button></div>`).join('')
      : '<div class="empty">Chưa có nhân sự nào.</div>'}
    <div class="btns" style="margin-top:8px">
      <button class="btn pri grow" data-act="addStaff">+ Thêm người</button>
      <button class="btn" data-close>Đóng</button></div>
    <div class="dim" style="margin-top:12px;line-height:1.6">
      Chạm vào tên để mở hồ sơ đầy đủ. Nút 🔗 tạo link để nhân viên mở trên máy họ và tự cập nhật tiến độ.
      Cần bật đồng bộ Supabase trước.
    </div></div></div>`;
}
function staffLink(id){
  const s = staff().find(x => x.id === id);
  if (!Sync.on()){ toast('Bật đồng bộ Supabase trước đã'); S.view='settings'; render(); return; }
  const payload = {u:db.settings.supabaseUrl, k:db.settings.supabaseKey, w:db.settings.workspace, n:s.name};
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const link = location.href.split('#')[0] + '#s=' + code;
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Link cho ${esc(s.name)}</h2>
    <div class="dim" style="margin-bottom:10px">Gửi link này cho nhân viên. Mở ra là thấy đúng phần việc của họ.
      Link chứa khoá truy cập không gian làm việc — chỉ gửi cho người bạn tin.</div>
    <div class="f"><textarea readonly id="lnk" style="min-height:96px;font-size:12px">${esc(link)}</textarea></div>
    <div class="btns"><button class="btn pri grow" data-act="copyLink">Sao chép</button>
      <button class="btn" data-close>Đóng</button></div></div></div>`;
}

/* ---------------- nhắc lặp lại qua Telegram ---------------- */
const remFields = () => [
  {k:'title', label:'Nhắc gì', ph:'Tập gym, uống thuốc, chốt sổ…'},
  {k:'time',  label:'Lúc mấy giờ', type:'time', half:true},
  {k:'topic', label:'Nhánh riêng cho lời nhắc này', half:true, ph:'để trống = nhánh nhắc lặp lại',
   hint:'số ID của topic, xem hướng dẫn trong Cài đặt'},
  {k:'days',  label:'Những thứ nào trong tuần', type:'days'},
  {k:'note',  label:'Nội dung thêm', type:'textarea', req:false, voice:true,
   ph:'mang theo găng tay, tập chân…'},
  {k:'enabled', label:'Trạng thái', type:'select', half:true,
   opts:[['yes','Đang bật'], ['','Tạm tắt']]}
];
/* Tick xong hôm nay — cùng dữ liệu với nút "✅ Xong hôm nay" trên Telegram. */
function toggleRemDone(id){
  const r = db.reminders.find(x => x.id === id); if (!r) return;
  const t = today();
  const log = (r.doneLog || []).map(String);
  const i = log.indexOf(t);
  if (i >= 0) log.splice(i, 1); else log.push(t);
  r.doneLog = log.slice(-80);
  stamp(r); save(); render();
  const n = remStreak(r);
  toast(i >= 0 ? 'Đã bỏ đánh dấu hôm nay'
               : (n > 1 ? `Xong hôm nay · chuỗi ${n} 🔥` : 'Xong hôm nay'));
}

function normalizeRem(v){
  v.enabled = v.enabled === 'yes' || v.enabled === true;
  v.days = (v.days || []).map(Number).filter(d => d >= 0 && d <= 6);
  v.topic = String(v.topic || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(v.time || '')) v.time = '08:00';
  return v;
}
function addRem(){
  openForm({title:'Lời nhắc mới', fields:remFields(),
    values:{time:'08:00', days:[1,2,3,4,5], enabled:'yes'},
    top:`<div class="dim" style="margin:-8px 0 12px;line-height:1.6">
      Máy chủ sẽ gửi tin vào Telegram đúng giờ này, kể cả khi bạn không mở app.</div>`,
    onSave(v){
      db.reminders.push(stamp(normalizeRem(v)));
      save(); render(); toast('Lần tới: ' + reminderNextText(v));
    }});
}
function editRem(id){
  const r = db.reminders.find(x => x.id === id);
  openForm({title:'Sửa lời nhắc', fields:remFields(),
    values:Object.assign({}, r, {enabled: r.enabled ? 'yes' : ''}),
    top:`<div class="dim" style="margin:-8px 0 12px">Lần tới: ${esc(reminderNextText(r))}</div>`,
    extra:`<button type="button" class="btn full dngr" style="margin-bottom:10px" data-act="delRem" data-id="${id}">Xoá lời nhắc</button>`,
    onSave(v){ Object.assign(r, normalizeRem(v)); stamp(r); save(); render(); }});
}

/* ---------------- Telegram ---------------- */
/* Cấu hình nằm ở máy chủ chứ không phải trong máy này: mã bot là thứ ai
   cầm được cũng nhắn được vào group của bạn, nên không để nó đi lung tung. */
let TG = null;
function tgLoad(){
  if (!Server.available()) return Promise.resolve(null);
  return Server.call('tg_get').then(d => { TG = d; return d; }).catch(() => null);
}
function tgBox(){
  const t = TG || {};
  openForm({title:'Thông báo Telegram', submit:'Lưu cấu hình',
    top:`<div class="dim" style="margin:-8px 0 12px;line-height:1.65">
      1. Nhắn <b>@BotFather</b> → <b>/newbot</b> → chép mã bot.<br>
      2. Thêm bot vào group của bạn, cho quyền gửi tin.<br>
      3. Nhắn một câu bất kỳ vào group rồi bấm <b>Dò group</b> bên dưới.<br>
      4. Muốn tách nhánh: nhắn một câu vào <b>từng nhánh</b> rồi bấm dò —
      danh sách ID nhánh sẽ hiện ra để bạn chép vào bốn ô nhánh.</div>`,
    fields:[
      {k:'token', label:'Mã bot' + (t.hasToken ? ' (đã có — để trống nếu không đổi)' : ''),
       ph:'123456:AAE…', req:false},
      {k:'chatId', label:'ID group', half:true, ph:'-1001234567890', req:false},
      {k:'topic', label:'Nhánh mặc định', half:true, ph:'để trống = nhánh chính'},
      {k:'digestHour', label:'Giờ gửi bản tóm tắt hằng ngày', type:'number', half:true,
       ph:'0-23', hint:'để trống hoặc -1 thì không gửi'},
      {k:'workHour', label:'Giờ gửi bảng công việc', type:'number', half:true,
       ph:'0-23', hint:'việc đến hạn, việc trễ, việc đã giao'},
      {k:'taskTopic', label:'Nhánh: việc cần làm', half:true,
       ph:'để trống = nhánh mặc định'},
      {k:'cardTopic', label:'Nhánh: giao việc', half:true,
       ph:'để trống = nhánh mặc định'},
      {k:'remTopic', label:'Nhánh: nhắc lặp lại', half:true,
       ph:'để trống = nhánh mặc định', hint:'gym, uống thuốc, chốt sổ…'},
      {k:'reportTopic', label:'Nhánh: báo cáo', half:true,
       ph:'để trống = nhánh mặc định', hint:'tóm tắt ngày, bảng công việc, tóm tắt tuần'},
      {k:'ideaTopic', label:'Nhánh: ý tưởng', half:true,
       ph:'để trống = nhánh mặc định', hint:'câu hỏi "làm hay bỏ" khi tới hẹn xem lại'},
      {k:'ideaHour', label:'Giờ hỏi lại ý tưởng', type:'number', half:true,
       ph:'0-23', hint:'chỉ hỏi khi ý tưởng có đặt ngày xem lại'},
      {k:'weeklyHour', label:'Giờ gửi tóm tắt tuần (Chủ nhật)', type:'number', half:true,
       ph:'0-23', hint:'để trống thì không gửi'},
      {k:'staffWeekly', label:'Tổng kết tuần theo nhân sự', type:'select', half:true,
       opts:[['yes','Bật — mỗi người một tin'], ['','Tắt']],
       hint:'gửi cùng giờ với tóm tắt tuần, vào nhánh Giao việc'},
      {k:'escalate', label:'Báo trễ leo thang', type:'select', half:true,
       opts:[['yes','Bật — báo riêng ở mốc 3/7/14/30 ngày trễ'], ['','Tắt']]},
      {k:'enabled', label:'Trạng thái', type:'select', half:true,
       opts:[['yes','Đang bật'], ['','Tạm tắt']]}
    ],
    values:{token:'', chatId:t.chatId || '', topic:t.topic || '',
            digestHour: t.digestHour == null ? 7 : t.digestHour,
            workHour: t.workHour == null ? -1 : t.workHour,
            /* lùi về nhánh công việc cũ để lần đầu mở ra không thấy ô trống trơn */
            taskTopic: t.taskTopic || t.workTopic || '',
            cardTopic: t.cardTopic || t.workTopic || '',
            remTopic: t.remTopic || '',
            reportTopic: t.reportTopic || t.workTopic || '',
            ideaTopic: t.ideaTopic || '',
            ideaHour: t.ideaHour == null ? 9 : t.ideaHour,
            weeklyHour: t.weeklyHour == null ? -1 : t.weeklyHour,
            staffWeekly: t.staffWeekly ? 'yes' : '',
            escalate: t.escalate ? 'yes' : '',
            enabled: t.enabled ? 'yes' : ''},
    extra:`<div class="btns" style="margin-bottom:10px">
        <button type="button" class="btn sm grow" data-act="tgDiscover">Dò group</button>
        <button type="button" class="btn sm grow" data-act="tgTest">Gửi thử</button>
      </div>
      <div class="dim" id="tgout" style="margin-bottom:10px;line-height:1.6"></div>`,
    onSave(v){
      const body = {chatId:String(v.chatId || '').trim(), topic:String(v.topic || '').trim(),
                    digestHour: v.digestHour === '' ? -1 : +v.digestHour,
                    workHour:   v.workHour   === '' ? -1 : +v.workHour,
                    taskTopic:  String(v.taskTopic || '').trim(),
                    cardTopic:  String(v.cardTopic || '').trim(),
                    remTopic:   String(v.remTopic || '').trim(),
                    reportTopic:String(v.reportTopic || '').trim(),
                    ideaTopic:  String(v.ideaTopic || '').trim(),
                    ideaHour:   v.ideaHour === '' ? -1 : +v.ideaHour,
                    weeklyHour: v.weeklyHour === '' ? -1 : +v.weeklyHour,
                    staffWeekly: v.staffWeekly === 'yes',
                    escalate:   v.escalate === 'yes',
                    enabled: v.enabled === 'yes'};
      if (v.token) body.token = v.token.trim();
      Server.call('tg_save', body)
        .then(d => { TG = d; render(); toast('Đã lưu cấu hình Telegram'); })
        .catch(err => toast(err.message));
    }});
}

/* Máy chủ đang thấy gì? Câu hỏi "sao đặt giờ mà không có tin" có tới
   năm sáu nguyên nhân khác nhau, đoán mò rất mất thời gian. */
function tgWhyBox(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Máy chủ đang thấy gì</h2>
    <div class="dim" style="margin:-8px 0 14px">Đang hỏi máy chủ…</div></div></div>`;

  Server.call('tg_why').then(d => {
    const cron = d.lastCron == null
      ? `<span style="color:var(--bad)">chưa chạy lần nào</span> — hẹn giờ cron chưa hoạt động`
      : d.lastCron > 20
        ? `<span style="color:var(--bad)">${d.lastCron} phút trước</span> — quá lâu, cron có vẻ đã ngừng`
        : `<span style="color:var(--ok)">${d.lastCron} phút trước</span>`;

    const rows = (d.items || []).length
      ? d.items.map(i => `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)">
          <div class="grow"><div class="ell" style="font-weight:600;font-size:14px">${esc(i.title)}</div>
            <div class="dim">${esc(i.kind)}${i.at ? ' · hẹn ' + esc(i.at) : ''}${
              i.due ? ' · hạn ' + esc(i.due) : ''}${
              i.snooze ? ' · ⏰ dời tới ' + esc(snoozeText(i.snooze)) : ''}</div></div>
          <span class="chip ${i.ok ? 'ok' : ''}">${esc(i.why)}</span></div>`).join('')
      : `<div class="dim" style="padding:8px 0">Máy chủ <b>không thấy</b> đầu việc nào có hẹn giờ.
         Nếu bạn vừa đặt trên máy này thì dữ liệu chưa đồng bộ lên —
         bấm <b>Đồng bộ ngay</b> ở mục Tài khoản rồi mở lại bảng này.</div>`;

    $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
      <h2>Máy chủ đang thấy gì</h2>
      <div class="dim" style="margin:-8px 0 14px;line-height:1.8">
        Giờ máy chủ: <b>${esc(String(d.now || ''))}</b><br>
        Cron chạy lần cuối: ${cron}<br>
        Telegram: ${d.enabled ? 'đang bật' : '<span style="color:var(--bad)">đang tắt</span>'} ·
        ${d.hasToken ? 'có mã bot' : '<span style="color:var(--bad)">chưa có mã bot</span>'} ·
        ${d.hasChat ? 'đã chọn group' : '<span style="color:var(--bad)">chưa chọn group</span>'}
      </div>
      ${rows}
      <button class="btn full" style="margin-top:14px" data-close>Đóng</button></div></div>`;
  }).catch(err => {
    $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
      <h2>Không hỏi được máy chủ</h2>
      <div class="dim" style="margin:-8px 0 14px">${esc(err.message)}</div>
      <button class="btn full" data-close>Đóng</button></div></div>`;
  });
}

/* Telegram đang thấy webhook thế nào. Câu "nhắn /ghi mà không thấy gì" hầu
   như lúc nào cũng là một trong ba thứ: chưa đăng ký lại sau khi cập nhật
   code, Telegram gọi về bị lỗi, hoặc gõ sai lệnh. Bảng này loại được hai
   cái đầu trong một cú bấm. */
function tgHookBox(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Telegram đang thấy gì</h2>
    <div class="dim" style="margin:-8px 0 14px">Đang hỏi Telegram…</div></div></div>`;

  Server.call('tg_webhook_info').then(d => {
    const yes = '<span style="color:var(--ok)">có</span>';
    const no  = '<span style="color:var(--bad)">KHÔNG</span>';
    const canhBao = !d.onMessage
      ? `<div class="card" style="margin-top:12px;border-color:var(--bad)">
           <b>Đây là lý do <code>/ghi</code> không chạy.</b><br>
           Webhook đăng ký từ trước bản cập nhật nên Telegram chưa gửi tin nhắn về.
           Bấm <b>Tắt nút bấm</b> rồi <b>Bật nút bấm</b> lại là xong.</div>`
      : '';
    $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
      <h2>Telegram đang thấy gì</h2>
      <div class="dim" style="margin:-8px 0 4px;line-height:1.8">
        Địa chỉ gọi về: ${d.url ? `<span class="mono" style="display:inline">${esc(d.url)}</span>` : no}<br>
        Nhận nút bấm: ${d.onButton ? yes : no}<br>
        Nhận tin nhắn (cho <code>/ghi</code>): ${d.onMessage ? yes : no}<br>
        Đang chờ xử lý: <b>${d.pending}</b> tin
        ${d.lastError ? `<br>Lỗi gần nhất: <span style="color:var(--bad)">${esc(d.lastError)}</span>${
          d.lastErrorAt ? ' (' + esc(d.lastErrorAt) + ')' : ''}` : ''}
      </div>
      ${canhBao}
      <div class="dim" style="margin-top:12px;line-height:1.65">
        Lệnh đúng là <code>/ghi</code> kèm nội dung, ví dụ
        <span class="mono" style="display:inline">/ghi mua thêm dầu gội</span>.
        Gõ dấu <b>/</b> trong group là Telegram hiện sẵn danh sách lệnh.
      </div>
      <button class="btn full" style="margin-top:14px" data-close>Đóng</button></div></div>`;
  }).catch(err => {
    $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
      <h2>Không hỏi được Telegram</h2>
      <div class="dim" style="margin:-8px 0 14px">${esc(err.message)}</div>
      <button class="btn full" data-close>Đóng</button></div></div>`;
  });
}

/* ---------------- sao lưu ---------------- */
function exportJSON(){
  const blob = new Blob([JSON.stringify(db, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'life-hub-' + today() + '.json';
  a.click(); URL.revokeObjectURL(a.href); toast('Đã xuất file');
}
function importJSON(){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || typeof d !== 'object') throw 0;
        db = merge(blank(), d.people ? d : migrateV1(d));
        ensure(); save(); render(); toast('Đã nhập dữ liệu');
      } catch(e){ toast('File không hợp lệ'); }
    };
    r.readAsText(f);
  };
  inp.click();
}
function seedDemo(){
  const D = n => addDays(today(), n);

  /* ---- mảng việc ---- */
  const A = [
    stamp({name:'Gym',               color:'#3ddc97'}),
    stamp({name:'Barbershop',        color:'#ffb84d'}),
    stamp({name:'Kinh doanh online', color:'#5b8cff'}),
    stamp({name:'Gia đình',          color:'#8b5cff'}),
    stamp({name:'Học & đọc',         color:'#4dd4d4'})
  ];
  db.areas.push(...A);
  const [gym, bar, onl, fam, hoc] = A.map(a => a.id);

  /* ---- người ---- */
  const P = (name, tier, o) => stamp(Object.assign(
    {name, tier, phone:'', birthday:'', tags:'', areaId:'', note:'', logs:[],
     lastContact:D(-3), history:[{date:D(-400), from:null, to:tier}]}, o));

  const ba    = P('Nguyễn Văn Hùng', 'S', {birthday:'1962-08-20', tags:'ba', areaId:fam,
    note:'Thích trà Thái Nguyên và cây cảnh. Huyết áp cao, nhớ hỏi thuốc.', lastContact:D(-2),
    logs:[{id:uid(), kind:'call', date:D(-2),  text:'Gọi hỏi thăm, ba nói cây mai bị sâu.'},
          {id:uid(), kind:'meal', date:D(-16), text:'Về ăn cơm, ba khoe mới mua ấm tử sa.'}]});
  const me    = P('Trần Thị Lan', 'S', {birthday:'1966-11-03', tags:'mẹ', areaId:fam,
    note:'Hay đau lưng. Thích ăn chè.', lastContact:D(-2),
    logs:[{id:uid(), kind:'call', date:D(-2), text:'Mẹ dặn Rằm tháng 7 nhớ về.'}]});
  const emgai = P('Nguyễn Thu Trang', 'S', {birthday:'1996-04-18', tags:'em gái', areaId:fam,
    note:'Đang học cao học, hay hỏi chuyện kinh doanh.', lastContact:D(-9), logs:[]});

  const tuan  = P('Trần Minh Tuấn', 'A', {birthday:'1992-09-02', tags:'bạn thân', areaId:'',
    note:'Hay giúp lúc khó khăn. Đang tính mở xưởng gỗ.', lastContact:D(-44),
    history:[{date:D(-400), from:null, to:'B'}, {date:D(-210), from:'B', to:'A'}],
    logs:[{id:uid(), kind:'meal', date:D(-44), text:'Ăn tối, nó kể muốn mở xưởng, đang thiếu vốn.'},
          {id:uid(), kind:'help', date:D(-65), text:'Cho mượn xe 3 ngày lúc xe mình hỏng.'}]});
  const nam   = P('Lê Hoàng Nam', 'A', {birthday:'1988-12-27', tags:'đối tác', areaId:onl,
    note:'Cùng nhập hàng. Sòng phẳng, nói là làm.', lastContact:D(-11),
    logs:[{id:uid(), kind:'meet', date:D(-11), text:'Cà phê bàn lô hàng tháng sau.'}]});

  const ha    = P('Lê Thu Hà', 'B', {birthday:'1994-08-25', tags:'đồng nghiệp cũ', areaId:onl,
    note:'Làm marketing, từng giúp chạy quảng cáo.', lastContact:D(-87), logs:[]});
  const khoa  = P('Phan Anh Khoa', 'B', {birthday:'1993-02-14', tags:'bạn đại học', areaId:'',
    note:'Ở xa, mỗi năm gặp 1-2 lần.', lastContact:D(-70), logs:[]});
  const linh  = P('Đỗ Mỹ Linh', 'B', {birthday:'1990-06-08', tags:'chủ tiệm bên cạnh', areaId:bar,
    note:'Hay giới thiệu khách qua lại.', lastContact:D(-21),
    logs:[{id:uid(), kind:'meet', date:D(-21), text:'Nói chuyện gộp khuyến mãi hai tiệm.'}]});
  const bacsi = P('BS. Trần Quốc', 'B', {birthday:'1975-05-30', tags:'bác sĩ gia đình', areaId:'',
    note:'Khám cho ba. Nên hỏi thăm dịp 27/2.', lastContact:D(-95), logs:[]});

  const chuba = P('Chú Ba hàng xóm', 'C', {tags:'hàng xóm', areaId:'',
    note:'Hay cho trái cây vườn.', lastContact:D(-14), logs:[]});
  const dung  = P('Anh Dũng sửa xe', 'C', {tags:'thợ quen', areaId:'',
    note:'Sửa xe uy tín, hay bớt tiền công.', lastContact:D(-40), logs:[]});
  const hanh  = P('Chị Hạnh kế toán', 'C', {tags:'kế toán thuê ngoài', areaId:bar,
    note:'Làm sổ sách cho tiệm theo tháng.', lastContact:D(-6), logs:[]});

  db.people.push(ba, me, emgai, tuan, nam, ha, khoa, linh, bacsi, chuba, dung, hanh);

  /* ---- trao đổi: có lịch sử để phần gợi ý mức quà hoạt động ---- */
  const G = (p, dir, title, value, date, occasion, note, repay) =>
    stamp({personId:p.id, dir, title, value, date, occasion:occasion||'', note:note||'', repay:repay||null});
  db.gifts.push(
    G(ba,   'out','Lì xì + giỏ quà Tết', 3000000, D(-186),'Tết'),
    G(ba,   'out','Ấm trà tử sa',        1200000, D(-360),'Sinh nhật'),
    G(me,   'out','Lì xì Tết',           2000000, D(-186),'Tết'),
    G(tuan, 'in', 'Giỏ quà Tết',          800000, D(-186),'Tết','',
      {title:'Rượu vang', value:750000, date:D(-181)}),
    G(tuan, 'in', 'Cho mượn xe 3 ngày',   900000, D(-65), '',  'Lúc xe mình hỏng'),
    G(nam,  'in', 'Giới thiệu mối hàng', 2000000, D(-120),'',  'Chốt được đơn sỉ đầu tiên'),
    G(nam,  'out','Cà phê + ăn trưa',     600000, D(-11)),
    G(ha,   'out','Quà cưới',            1000000, D(-130),'Đám cưới'),
    G(ha,   'out','Quà 20/11',            500000, D(-268),'Ngày Nhà giáo'),
    G(linh, 'in', 'Giới thiệu 5 khách',   750000, D(-50), '',  'Khách qua từ tiệm chị'),
    G(linh, 'out','Voucher cắt tóc',      400000, D(-30), '',  '', null),
    G(bacsi,'out','Giỏ trái cây',         450000, D(-95), 'Ngày Thầy thuốc'),
    G(chuba,'in', 'Trái cây vườn',        150000, D(-14)),
    G(chuba,'in', 'Trông nhà giúp 2 ngày',400000, D(-60)),
    G(dung, 'in', 'Sửa xe không lấy công',300000, D(-40)),
    G(khoa, 'in', 'Quà sinh nhật',        500000, D(-180),'Sinh nhật')
  );

  /* ---- việc cần làm: đủ kiểu lặp, chuỗi, quá hạn ---- */
  const T = (title, o) => stamp(Object.assign(
    {title, due:'', repeat:'', prio:'mid', areaId:'', note:'', done:false,
     streak:0, bestStreak:0, doneLog:[], createdAt:D(-30)}, o));
  db.tasks.push(
    T('Tập gym',                    {due:today(), repeat:'d2', prio:'high', areaId:gym,
                                     streak:6, bestStreak:11, doneLog:[D(-2),D(-4),D(-6),D(-8)]}),
    T('Đọc 20 trang sách',          {due:today(), repeat:'d1', areaId:hoc,
                                     streak:12, bestStreak:12, doneLog:[D(-1),D(-2),D(-3),D(-4),D(-5)]}),
    T('Kiểm tiền quỹ barbershop',   {due:D(2),  repeat:'w1', areaId:bar, streak:3, bestStreak:5,
                                     doneLog:[D(-5),D(-12)]}),
    T('Chốt sổ doanh thu online',   {due:D(1),  repeat:'w1', areaId:onl, streak:2, bestStreak:6,
                                     doneLog:[D(-6)]}),
    T('Đóng tiền mặt bằng tiệm',    {due:D(-2), repeat:'m1', prio:'high', areaId:bar,
                                     streak:0, bestStreak:4, note:'Chuyển khoản cho chị chủ nhà'}),
    T('Gọi điện hỏi thăm ba mẹ',    {due:today(), repeat:'w1', prio:'high', areaId:fam,
                                     streak:4, bestStreak:9, doneLog:[D(-7),D(-14)]}),
    T('Bảo trì máy chạy bộ',        {due:D(-5), repeat:'m3', prio:'high', areaId:gym,
                                     note:'Gọi thợ quen, lần trước 1tr2'}),
    T('Đóng bảo hiểm xe',           {due:D(21), repeat:'y1', areaId:''}),
    T('Nhập thêm sáp vuốt tóc',     {due:D(3),  prio:'high', areaId:bar}),
    T('Chụp lại ảnh sản phẩm',      {due:D(5),  areaId:onl, note:'Thuê studio hoặc tự chụp'}),
    T('Tìm hiểu gói quảng cáo mới', {areaId:onl, prio:'low'}),
    T('Hỏi chị Hạnh về thuế quý',   {due:D(6),  areaId:bar}),
    T('Đặt bàn giỗ ông nội',        {due:D(7),  prio:'high', areaId:fam}),
    T('Thay lưới lọc máy lạnh',     {done:true, doneAt:D(-3), doneLog:[D(-3)], areaId:bar}),
    T('Gia hạn tên miền',           {done:true, doneAt:D(-5), doneLog:[D(-5)], areaId:onl})
  );

  /* ---- ý tưởng ---- */
  const I = (title, status, areaId, detail, plan) =>
    stamp({title, status, areaId, detail, plan, createdAt:D(-20)});
  db.ideas.push(
    I('Gói tập 3 tháng kèm cắt tóc miễn phí','explore', gym,
      'Khách gym và khách barbershop trùng nhau nhiều, có thể bán chéo.',
      '1. Thử với 20 khách quen\n2. Tính lại giá vốn\n3. Ổn thì làm poster'),
    I('Bán combo sáp + lược online','doing', onl,
      'Khách hỏi mua sáp sau khi cắt tóc, hiện chưa có kênh bán.',
      '1. Chụp ảnh sản phẩm\n2. Đăng thử 2 tuần\n3. Đo tỉ lệ chốt'),
    I('Lớp tập nhóm buổi sáng','seed', gym,
      'Khung 6-7h sáng phòng trống, có thể mở lớp nhóm 8 người.', ''),
    I('Thẻ thành viên tích điểm chung 2 tiệm','seed', bar,
      'Chị Linh bên cạnh cũng muốn làm chung.','Cần bàn lại chuyện chia doanh thu.')
  );

  /* ---- nhân sự & bảng giao việc ---- */
  const st = [
    stamp({name:'Phạm Quốc Anh', role:'Quản lý gym', areaIds:[gym], phone:'',
      startDate:D(-700), note:'Chắc tay, tự lo được. Hơi ngại việc giấy tờ.'}),
    stamp({name:'Ngô Bích Ngọc', role:'Bán hàng online', areaIds:[onl], phone:'',
      startDate:D(-300), note:'Nhanh nhẹn, hay trễ hạn khi ôm nhiều việc một lúc.'}),
    stamp({name:'Trần Văn Hải',  role:'Thợ chính barbershop', areaIds:[bar], phone:'',
      startDate:D(-1100), note:'Tay nghề tốt nhất tiệm, khách quen hay hỏi.'}),
    stamp({name:'Lý Thu Uyên',   role:'Lễ tân', areaIds:[bar, gym], phone:'',
      startDate:D(-120), note:'Mới vào, đang học thêm phần gội đầu.'})
  ];
  db.staff.push(...st);
  const C = (title, o) => stamp(Object.assign(
    {title, assignee:'', col:'assigned', due:'', prio:'mid', progress:0, areaId:'',
     desc:'', checklist:[], extra:false, extraPay:0, extraPaidDate:'', doneAt:'', createdAt:D(-20)}, o));
  db.cards.push(
    C('Kiểm kê kho phụ kiện',      {assignee:'Phạm Quốc Anh', col:'doing', due:D(4),  prio:'high',
                                    progress:40, areaId:gym, desc:'Đếm thực tế và đối chiếu sổ.'}),
    C('Soạn báo giá khách sỉ',     {assignee:'Ngô Bích Ngọc', col:'doing', due:D(-3), prio:'high',
                                    progress:80, areaId:onl, desc:'Khách hỏi 3 lần rồi.'}),
    C('Dọn kho cuối tháng',        {assignee:'Phạm Quốc Anh', col:'done',  due:D(-6),
                                    progress:100, areaId:gym, doneAt:D(-7)}),
    C('Lên lịch trực tháng sau',   {assignee:'Lý Thu Uyên',   col:'assigned', due:D(6), areaId:bar}),
    C('Đăng 12 bài sản phẩm',      {assignee:'Ngô Bích Ngọc', col:'assigned', due:D(9),
                                    areaId:onl, desc:'Mỗi ngày 1 bài, dùng ảnh mới.'}),
    C('Thiết kế poster khuyến mãi',{col:'idea', areaId:bar, prio:'low',
                                    desc:'Chờ chốt nội dung combo.'}),
    C('Thử nghiệm lớp tập nhóm',   {col:'idea', areaId:gym, desc:'Khung 6-7h sáng.'}),
    C('Vệ sinh ghế cắt',           {assignee:'Trần Văn Hải',  col:'done', due:D(-9),
                                    progress:100, areaId:bar, doneAt:D(-9)}),
    C('Đào tạo gội đầu cho Uyên',  {assignee:'Trần Văn Hải',  col:'doing', due:D(10),
                                    progress:30, areaId:bar}),
    C('Gọi lại 20 khách cũ',       {assignee:'Lý Thu Uyên',   col:'assigned', due:D(-1),
                                    prio:'high', areaId:gym, desc:'Khách hết hạn thẻ tháng trước.'}),
    C('Trực thay ca chủ nhật',     {assignee:'Trần Văn Hải',  col:'done', due:D(-5), progress:100,
                                    areaId:bar, extra:true, extraPay:500000, extraPaidDate:'', doneAt:D(-5),
                                    desc:'Làm thay ca của Uyên nghỉ ốm.'}),
    C('Chở hàng giúp buổi tối',    {assignee:'Phạm Quốc Anh', col:'done', due:D(-11), progress:100,
                                    areaId:onl, extra:true, extraPay:300000, extraPaidDate:D(-9), doneAt:D(-11),
                                    desc:'Ngoài giờ, đã bồi dưỡng.'}),
    C('Quay clip giới thiệu tiệm', {assignee:'Ngô Bích Ngọc', col:'doing', due:D(6), progress:30,
                                    areaId:bar, extra:true, extraPay:800000, extraPaidDate:'',
                                    desc:'Việc ngoài chuyên môn, thoả thuận trả riêng.'}),
    C('Kiểm tra tồn kho sáp',      {assignee:'Trần Văn Hải',  col:'done', due:D(-4),
                                    progress:100, areaId:bar, doneAt:D(-2)}),
    C('Dựng bảng giá mới',         {assignee:'Phạm Quốc Anh', col:'assigned', due:D(12), areaId:gym}),
    C('Trả lời tin nhắn tồn',      {assignee:'Ngô Bích Ngọc', col:'doing', due:today(),
                                    prio:'high', progress:60, areaId:onl}),
    C('Nghiên cứu app đặt lịch',   {col:'idea', areaId:bar, prio:'low'})
  );

  /* ---- dịp & lễ ---- */
  const O = (title, cal, day, month, remind, personIds, note) =>
    stamp({title, cal, day, month, remind, personIds:personIds||[], note:note||''});
  db.occasions.push(
    O('Giỗ ông nội',        'lunar', 12, 7,  10, [ba.id, me.id],        'Làm ở nhà bác cả'),
    O('Lễ Vu Lan',          'lunar', 15, 7,  7,  [ba.id, me.id],        'Về nhà thắp hương'),
    O('Tết Trung Thu',      'lunar', 15, 8,  10, [linh.id, chuba.id],   'Tặng bánh khách quen'),
    O('Tết Nguyên Đán',     'lunar', 1,  1,  21, [ba.id, me.id, tuan.id, nam.id, chuba.id],
      'Chuẩn bị quà cho gia đình, đối tác và hàng xóm'),
    O('Ngày Nhà giáo 20/11','solar', 20, 11, 7,  [ha.id]),
    O('Ngày Thầy thuốc VN', 'solar', 27, 2,  5,  [bacsi.id],            'Bác sĩ khám cho ba'),
    O('Kỷ niệm ngày mở tiệm','solar', 9, 9,  14, [linh.id],             'Năm nay làm khuyến mãi 2 tiệm')
  );

  save(); closeModal(); render(); toast('Đã nạp dữ liệu mẫu đầy đủ');
}

/* ---------------- điều phối sự kiện ---------------- */
document.addEventListener('click', e => {
  if (e.target.hasAttribute('data-ovclose') || e.target.closest('[data-close]')){ closeModal(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;

  switch(a){
    /* điều hướng */
    case 'nav':     S.view = id; S.q = ''; setSide(false); render(); break;
    case 'burger':  setSide(!S.side); break;
    case 'scrim':   setSide(false); break;
    case 'area':    S.area = id; setSide(false); render(); break;
    case 'ideatab': S.ideatab = id; render(); break;
    case 'asg':     S.assignee = (S.assignee === id ? 'all' : id); closeModal(); S.view='board'; render(); break;
    case 'person':  S.personId = id; S.view = 'person'; render(); break;
    case 'theme':
      db.settings.theme = db.settings.theme === 'dark' ? 'light' : 'dark';
      applyTheme(); save(); renderSide(); break;
    case 'fab':
      if (S.view === 'inbox') quickCapture();
      else if (S.view === 'people') addPerson();
      else if (S.view === 'work') addTask();
      else if (S.view === 'ideas') addIdea();
      else if (S.view === 'board') addCard('idea');
      else quickAdd();
      break;

    /* người */
    case 'addPerson':  addPerson(); break;
    case 'editPerson': editPerson(id); break;
    case 'chTier':     chTier(id); break;
    case 'setTier': {
      const p = db.people.find(x => x.id === id), t = el.dataset.t;
      if (p.tier !== t){ p.history = p.history || []; p.history.push({date:today(), from:p.tier, to:t}); p.tier = t; stamp(p); save(); }
      closeModal(); render(); break;
    }
    case 'delPerson':
      confirmBox('Xoá người này và toàn bộ ghi nhận?', () => {
        const p = db.people.find(x => x.id === id);
        p.deleted = true; stamp(p);
        db.gifts.filter(g => g.personId === id).forEach(g => { g.deleted = true; stamp(g); });
        save(); S.view = 'people'; render();
      }); break;
    case 'quickLog': closeModal(); quickLog(id); break;
    case 'delLog': {
      const p = db.people.find(x => x.id === id);
      p.logs = (p.logs||[]).filter(l => l.id !== el.dataset.lid); stamp(p); save(); render(); break;
    }

    /* trao đổi */
    case 'addGift':  addGift(id, el.dataset.dir); break;
    case 'repay':    closeModal(); repay(id); break;
    case 'giftMenu': giftMenu(id); break;
    case 'editGift': closeModal(); editGift(id); break;
    case 'delGift':  closeModal(); confirmBox('Xoá ghi nhận này?', () => {
        const g = db.gifts.find(x => x.id === id); g.deleted = true; stamp(g); save(); render(); }); break;

    /* việc */
    case 'addTask':    addTask(); break;
    case 'editTask':   editTask(id); break;
    case 'toggleTask': toggleTask(id); break;
    case 'delTask':    closeModal(); confirmBox('Xoá việc này?', () => {
        const t = db.tasks.find(x => x.id === id); t.deleted = true; stamp(t); save(); render(); }); break;

    /* ý tưởng */
    case 'addIdea':  addIdea(); break;
    case 'ideaRev':  ideaReview(id, el.dataset.r); break;
    case 'editIdea': editIdea(id); break;
    case 'delIdea':  closeModal(); confirmBox('Xoá ý tưởng này?', () => {
        const i = db.ideas.find(x => x.id === id); i.deleted = true; stamp(i); save(); render(); }); break;
    case 'ideaToCard': {
      const i = db.ideas.find(x => x.id === id);
      db.cards.push(stamp({title:i.title, desc:(i.detail||'') + (i.plan?'\n\n'+i.plan:''), assignee:'',
        col:'idea', areaId:i.areaId, due:'', prio:'mid', progress:0, checklist:[], createdAt:today()}));
      save(); closeModal(); S.view='board'; render(); toast('Đã đưa lên bảng giao việc'); break;
    }

    /* thẻ */
    case 'addCard': addCard(id); break;
    case 'addCardFor': { S.assignee = id; addCard('assigned'); break; }
    case 'card':    openCard(id); break;
    case 'mv': {
      const c = db.cards.find(x => x.id === id);
      const i = COLS.findIndex(x => x.id === c.col) + (+el.dataset.d);
      if (i >= 0 && i < COLS.length){
        c.col = COLS[i].id;
        if (c.col === 'done'){ c.progress = 100; c.doneAt = c.doneAt || today(); c.snoozeUntil = ''; }
        else c.doneAt = '';
        stamp(c); save(); closeModal(); render(); toast('→ ' + COLS[i].label);
      } break;
    }
    case 'payExtra': {
      const c = db.cards.find(x => x.id === id);
      if (c.extraPaidDate){ c.extraPaidDate = ''; toast('Bỏ đánh dấu đã trả'); }
      else if (!c.extraPay){ closeModal(); openCard(id); toast('Nhập số tiền trước đã'); break; }
      else { c.extraPaidDate = today(); toast('Đã trả ' + money(c.extraPay) + ' cho ' + (c.assignee || 'người làm')); }
      stamp(c); save(); render(); break;
    }
    case 'payAllExtra': {
      const who = el.dataset.who;
      const list = extraCards().filter(c => (c.assignee || '— chưa giao —') === who && !c.extraPaidDate && c.extraPay);
      if (!list.length){ toast('Không còn khoản nào chưa trả'); break; }
      const total = list.reduce((a2,c) => a2 + c.extraPay, 0);
      confirmBox(`Đánh dấu đã trả ${money(total)} cho ${who}? (${list.length} việc)`, () => {
        list.forEach(c => { const r = db.cards.find(x => x.id === c.id); r.extraPaidDate = today(); stamp(r); });
        save(); render(); toast('Đã ghi nhận chi trả');
      }, 'Đã trả');
      break;
    }
    case 'toggleCard': {
      const c = db.cards.find(x => x.id === id);
      if (c.col === 'done'){ c.col = 'doing'; c.doneAt = ''; if (c.progress === 100) c.progress = 90; }
      else { c.col = 'done'; c.progress = 100; c.doneAt = today(); c.snoozeUntil = ''; }
      stamp(c); save(); render();
      toast(c.col === 'done' ? 'Đã hoàn thành: ' + c.title : 'Mở lại: ' + c.title);
      break;
    }
    case 'delCard': closeModal(); confirmBox('Xoá thẻ này?', () => {
        const c = db.cards.find(x => x.id === id); c.deleted = true; stamp(c); save(); render(); }); break;

    /* hộp ghi nhanh */
    case 'capture':  quickCapture(); break;
    case 'capSave':  saveCapture(false); break;
    case 'capMore':  saveCapture(true); break;
    case 'inboxTo':  inboxTo(el.dataset.k, id); break;
    case 'inboxDone': {
      const n = db.inbox.find(x => x.id === id);
      n.processed = true; n.processedAs = ''; stamp(n); save(); render(); break;
    }
    case 'inboxReopen': {
      const n = db.inbox.find(x => x.id === id);
      n.processed = false; stamp(n); save(); render(); break;
    }
    case 'inboxDel': {
      const n = db.inbox.find(x => x.id === id);
      n.deleted = true; stamp(n); save(); render(); break;
    }
    case 'inboxClear': confirmBox('Xoá hết các mẩu đã xử lý?', () => {
        inbox().filter(n => n.processed).forEach(n => {
          const r = db.inbox.find(x => x.id === n.id); r.deleted = true; stamp(r);
        });
        save(); render();
      }); break;

    /* tìm kiếm + lịch */
    case 'search': searchBox(); break;
    case 'goto': {
      closeModal();
      const k = el.dataset.k;
      if (k === 'person' || k === 'gift'){ S.personId = id; S.view = 'person'; }
      else if (k === 'task'){ S.view = 'work'; render(); editTask(id); break; }
      else if (k === 'idea'){
        /* Ý tưởng đã xong/tạm gác nằm trong Kho — nhảy sang đúng nhóm, không
           thì đóng ô sửa xong lại thấy danh sách trống trơn. */
        const i2 = db.ideas.find(x => x.id === id);
        S.view = 'ideas';
        S.ideatab = i2 && (i2.status === 'done' || i2.status === 'drop') ? 'kho' : 'live';
        render(); editIdea(id); break; }
      else if (k === 'card'){ S.view = 'board'; render(); openCard(id); break; }
      else if (k === 'occasion'){ S.view = 'occasions'; }
      render(); break;
    }
    case 'calDay':  S.calDay = id; S.calMonth = id.slice(0,7); render(); break;
    case 'calNav':  S.calMonth = addMonths(S.calMonth + '-01', +id).slice(0,7); render(); break;
    case 'calToday': S.calMonth = today().slice(0,7); S.calDay = today(); render(); break;
    case 'moneyNav': S.moneyMonth = shiftMonth(S.moneyMonth, +id); render(); break;
    case 'moneyNow': S.moneyMonth = today().slice(0,7); render(); break;
    case 'moneyGo':  S.moneyMonth = id; render(); break;
    case 'addTaskOn': addTask(id); break;

    /* dịp & lễ */
    case 'addOcc':     addOcc(); break;
    case 'editOcc':    editOcc(id); break;
    case 'presetOcc':  presetOcc(); break;
    case 'usePreset':  closeModal(); addOcc(OCCASION_PRESETS[+id]); break;
    case 'delOcc':     closeModal(); confirmBox('Xoá dịp này?', () => {
        const o = db.occasions.find(x => x.id === id); o.deleted = true; stamp(o); save(); render(); }); break;

    /* mảng việc */
    case 'addArea':  closeModal(); addArea(); break;
    case 'areaBox':  areaBox(); break;
    case 'editArea': closeModal(); editArea(id); break;
    case 'delArea':  confirmBox('Xoá mảng này? Các việc thuộc mảng vẫn còn.', () => {
        const x = db.areas.find(y => y.id === id); x.deleted = true; stamp(x);
        if (S.area === id) S.area = 'all'; save(); render(); }); break;

    /* nhân sự */
    case 'staffBox': staffBox(); break;
    case 'addStaff':  closeModal(); addStaff(); break;
    case 'editStaff': closeModal(); editStaff(id); break;
    case 'staffPage': closeModal(); S.staffId = id; S.view = 'staff'; render(); break;
    case 'delStaff':  closeModal(); confirmBox('Xoá nhân sự này? Thẻ việc đã giao vẫn giữ nguyên tên.', () => {
        const s = db.staff.find(x => x.id === id); s.deleted = true; stamp(s);
        save(); if (S.view === 'staff') S.view = 'board'; render(); }); break;
    case 'staffLink': closeModal(); staffLink(id); break;
    case 'copyLink': {
      const ta = $('#lnk'); ta.select();
      navigator.clipboard ? navigator.clipboard.writeText(ta.value).then(()=>toast('Đã sao chép'))
                          : (document.execCommand('copy'), toast('Đã sao chép'));
      break;
    }

    /* dữ liệu */
    case 'export': exportJSON(); break;
    case 'import': importJSON(); break;
    case 'seed':   seedDemo(); break;
    case 'wipe':   closeModal(); confirmBox(
      Sync.on() ? 'Xoá TOÀN BỘ dữ liệu? Đang bật đồng bộ nên các máy khác cũng mất theo.'
                : 'Xoá TOÀN BỘ dữ liệu trên máy này?', () => {
        /* Khi đang đồng bộ, xoá trắng ở máy này là vô nghĩa: lần kéo về sau
           máy chủ sẽ trả lại đúng ngần ấy bản ghi. Phải đánh dấu đã xoá để
           thông tin đó lan sang các máy còn lại. */
        if (Sync.on()){
          COLLECTIONS.forEach(k => db[k].forEach(o => { if (!o.deleted){ o.deleted = true; stamp(o); } }));
        } else {
          const keep = db.settings;
          db = blank(); db.settings = keep;
        }
        save(); render(); toast('Đã xoá sạch'); }); break;

    /* nhắc nhở */
    case 'toggleNotify':
      if (db.settings.notifyOn){ db.settings.notifyOn = false; save(); Notify.start(); render(); }
      else Notify.request().then(() => render());
      break;
    case 'testNotify': Notify.testFire(); break;
    case 'saveHour':
      db.settings.notifyHour = Math.max(0, Math.min(23, +$('#set_hour').value || 8));
      save(); Notify.start(); toast('Đã lưu giờ nhắc'); break;

    /* bản mới của app */
    case 'doRefresh': doRefresh(); break;
    case 'hideUpd': { const b = el.closest('.updbar'); if (b) b.remove(); break; }
    case 'whyNoServer': whyNoServer(); break;

    /* nhắc lặp lại */
    case 'addRem':  addRem(); break;
    case 'editRem': editRem(id); break;
    case 'delRem':  closeModal(); confirmBox('Xoá lời nhắc này?', () => {
        const r = db.reminders.find(x => x.id === id); r.deleted = true; stamp(r); save(); render(); }); break;
    case 'toggleRem': {
      const r = db.reminders.find(x => x.id === id);
      r.enabled = !r.enabled; stamp(r); save(); render();
      toast(r.enabled ? 'Bật: ' + reminderNextText(r) : 'Đã tắt ' + r.title);
      break;
    }
    case 'remNow': {
      /* Đẩy lên trước rồi mới nhờ máy chủ gửi: máy chủ dựng tin từ bản ghi
         của nó, nên lời nhắc vừa sửa mà chưa đồng bộ sẽ gửi ra nội dung cũ. */
      toast('Đang gửi…');
      Promise.resolve(Sync.run(true))
        .then(() => Server.call('tg_rem_now', {id}))
        .then(d => toast(d.buttons ? 'Đã gửi — có nút "Xong hôm nay"'
                                   : 'Đã gửi (bật nút bấm để có nút Xong)'))
        .catch(err => toast(err.message));
      break;
    }

    case 'remDone': toggleRemDone(id); break;

    /* dời nhắc */
    case 'snooze': snoozeBox(el.dataset.k, id); break;
    case 'snzSet': snoozeApply(el.dataset.k, id, +el.dataset.m); break;

    /* Telegram */
    case 'tgBox':  tgBox(); break;
    case 'workNow':
      toast('Đang gửi…');
      Server.call('tg_work_now')
        .then(d => toast(d.empty ? 'Không có việc nào đang treo — chưa gửi gì cả'
                                 : 'Đã đẩy bảng công việc vào Telegram'))
        .catch(err => toast(err.message));
      break;
    case 'tgWhy': tgWhyBox(); break;
    case 'tgHook': tgHookBox(); break;
    case 'weeklyNow':
      toast('Đang gửi…');
      Server.call('tg_weekly_now')
        .then(() => toast('Đã đẩy tóm tắt tuần vào Telegram'))
        .catch(err => toast(err.message));
      break;
    case 'staffNow':
      toast('Đang gửi…');
      Server.call('tg_staff_now')
        .then(d => toast(d.empty ? 'Chưa có ai đang giữ thẻ việc nào — không gửi gì cả'
                                 : `Đã gửi tổng kết cho ${d.people} người`))
        .catch(err => toast(err.message));
      break;
    case 'webhookOn':
      toast('Đang bật…');
      Server.call('tg_webhook_enable')
        .then(() => tgLoad()).then(() => { render(); toast('Đã bật nút Xong'); })
        .catch(err => toast(err.message));
      break;
    case 'webhookOff':
      Server.call('tg_webhook_disable')
        .then(() => tgLoad()).then(() => { render(); toast('Đã tắt nút Xong'); })
        .catch(err => toast(err.message));
      break;
    case 'tgTest': {
      const out = $('#tgout');
      if (out) out.textContent = 'Đang gửi…';
      Server.call('tg_send', {text:'✅ Life Hub nối được với group này rồi.',
                              topic: ($('#f_topic') || {}).value || ''})
        .then(() => { if (out) out.textContent = 'Đã gửi. Kiểm tra group xem tin đã vào đúng nhánh chưa.'; })
        .catch(err => { if (out) out.textContent = 'Lỗi: ' + err.message; });
      break;
    }
    case 'tgDiscover': {
      const out = $('#tgout');
      if (out) out.textContent = 'Đang dò… hãy chắc là bạn vừa nhắn một câu vào group.';
      const tok = ($('#f_token') || {}).value || '';
      Server.call('tg_discover', tok ? {token:tok.trim()} : {})
        .then(d => {
          if (!d.chats.length){ out.textContent = 'Chưa thấy group nào. Nhắn một câu vào group rồi bấm lại.'; return; }
          const c = d.chats[0];
          if ($('#f_chatId')) $('#f_chatId').value = c.id;
          /* Liệt kê đủ mọi nhánh dò được: giờ có bốn ô nhánh phải điền, chỉ
             gợi ý mỗi cái đầu tiên thì vẫn phải mò thủ công ba cái còn lại. */
          out.innerHTML = 'Đã điền ID group <b>' + esc(c.title || c.id) + '</b> vào ô bên trên.' +
            '<br>Các nhánh bot nhìn thấy — chép số vào ô nhánh tương ứng:<br>' +
            d.chats.map(x => '· ' + (x.topic
                ? '<b>' + esc(String(x.topic)) + '</b>' + (x.name ? ' — ' + esc(x.name) : '')
                : '<b>nhánh chính</b>') +
              (String(x.id) !== String(c.id) ? ' <i>(group ' + esc(x.title || x.id) + ')</i>' : '')).join('<br>') +
            '<br>Nhánh nào chưa thấy thì nhắn một câu vào đó rồi bấm dò lại.';
        })
        .catch(err => { if (out) out.textContent = 'Lỗi: ' + err.message; });
      break;
    }

    /* tài khoản trên máy chủ */
    case 'logout': logoutBox(); break;
    case 'doLogout': {
      const wipe = el.dataset.wipe === '1';
      closeModal();
      Server.logout().then(() => {
        if (wipe){
          /* Chỉ xoá bản sao trên máy này. Dữ liệu trên máy chủ không đụng tới —
             đăng nhập lại là tải về đủ. */
          const keep = db.settings;
          db = blank(); db.settings = keep;
          persist();
        }
        Gate.show(wipe ? 'Đã đăng xuất và xoá dữ liệu trên máy này.' : 'Đã đăng xuất.');
      });
      break;
    }
    case 'logoutAll': confirmBox('Đá tất cả thiết bị ra khỏi phiên đăng nhập?', () => {
        Server.logoutAll().then(() => Gate.show('Mọi thiết bị đã bị đăng xuất.'))
                          .catch(err => toast(err.message));
      }, 'Đăng xuất hết'); break;
    case 'srvStats': {
      Server.stats().then(d => {
        const kb = Math.round(d.size / 1024);
        $('#srvinfo').innerHTML = `${d.records} bản ghi · ${d.trashed} đã xoá · ${d.devices} thiết bị đang đăng nhập
          · ${kb} KB${d.last ? ' · thay đổi gần nhất ' + fmtDate(d.last) : ''}`
          + (d.dbInWebRoot ? `<div class="chip bad" style="margin-top:8px;white-space:normal;text-align:left">
              ⚠︎ File dữ liệu đang nằm trong thư mục web (${esc(d.dbDir)}).
              Deploy bằng Git có thể xoá mất nó. Xem mục "Chỗ để file dữ liệu" trong README
              để chuyển ra ngoài public_html.</div>` : '');
      }).catch(err => { $('#srvinfo').textContent = err.message; });
      break;
    }

    /* đồng bộ */
    case 'saveSync': {
      db.settings.supabaseUrl = $('#set_url').value.trim();
      db.settings.supabaseKey = $('#set_key').value.trim();
      db.settings.workspace   = $('#set_ws').value.trim();
      db.settings.role        = $('#set_role').value;
      db.settings.staffName   = $('#set_staff').value.trim();
      save();
      if (!Sync.on()){ toast('Đã tắt đồng bộ'); render(); break; }
      Sync.test().then(() => { toast('Kết nối tốt, đang đồng bộ…'); Sync.start(); })
                 .catch(err => toast(err.message)).finally(() => render());
      break;
    }
    case 'syncNow': Sync.run(); break;
    case 'genWs': {
      const w = 'ws-' + Math.random().toString(36).slice(2,8) + Math.random().toString(36).slice(2,6);
      $('#set_ws').value = w; toast('Đã tạo: ' + w); break;
    }
  }
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); searchBox(); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j'){ e.preventDefault(); quickCapture(); }
  else if (e.key === 'Escape') closeModal();
});

function logoutBox(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Đăng xuất</h2>
    <div class="dim" style="margin:-8px 0 14px;line-height:1.6">
      Dữ liệu trên máy chủ không bị đụng tới trong cả hai lựa chọn.
    </div>
    <div class="btns" style="flex-direction:column">
      <button class="btn full pri" data-act="doLogout" data-wipe="0">Chỉ đăng xuất</button>
      <div class="dim" style="margin:-4px 0 6px">Giữ bản sao trên máy này, lần sau mở lại rất nhanh.</div>
      <button class="btn full dngr" data-act="doLogout" data-wipe="1">Đăng xuất và xoá dữ liệu trên máy này</button>
      <div class="dim" style="margin:-4px 0 6px">Dùng khi đang mượn máy người khác. Đăng nhập lại sẽ tải về từ máy chủ.</div>
      <button class="btn full" data-close>Huỷ</button>
    </div></div></div>`;
}

function quickAdd(){
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Thêm nhanh</h2>
    <div class="btns" style="flex-direction:column">
      <button class="btn full pri" data-act="capture">✎ Ghi nhanh (chưa phân loại)</button>
      <button class="btn full" data-act="addTask">✓ Việc cần làm</button>
      <button class="btn full" data-act="addPerson">◍ Người quen</button>
      <button class="btn full" data-act="addIdea">💡 Ý tưởng</button>
      <button class="btn full" data-act="addCard" data-id="idea">▦ Thẻ giao việc</button>
      <button class="btn full" data-close>Đóng</button>
    </div></div></div>`;
}

/* ---------------- khởi động ---------------- */
function applyShareLink(){
  const m = location.hash.match(/#s=(.+)$/);
  if (!m) return false;
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    db.settings.supabaseUrl = p.u; db.settings.supabaseKey = p.k;
    db.settings.workspace = p.w;   db.settings.staffName = p.n || '';
    db.settings.role = p.n ? 'staff' : 'owner';
    history.replaceState(null, '', location.pathname + location.search);
    save(); toast(p.n ? 'Chào ' + p.n + '! Đang tải việc của bạn…' : 'Đã nhận cấu hình đồng bộ');
    return true;
  } catch(e){ return false; }
}

/* Lưu riêng một khoá nhỏ cho chủ đề: thẻ <script> ở <head> đọc được ngay
   mà không phải phân tích cả kho dữ liệu, nên không loé màu lúc mở app. */
function applyTheme(){
  const t = db.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('lifehub.theme', t); } catch(e){}
  const tc = document.getElementById('tc');
  if (tc) tc.content = t === 'light' ? '#f4f6fa' : '#0e1014';
}

/* Thanh mời tải lại khi máy chủ đã có bản mới. Chỉ hiện một lần,
   và không tự tải lại — đang gõ dở mà trang nhảy thì rất khó chịu. */
let _updateShown = false;
function updateBar(){
  if (_updateShown) return;
  _updateShown = true;
  const el = document.createElement('div');
  el.className = 'updbar';
  el.innerHTML = `<span>Đã có bản mới của app.</span>
    <button class="btn sm pri" data-act="doRefresh">Tải lại</button>
    <button class="iconbtn" data-act="hideUpd" title="Để sau">✕</button>`;
  document.body.appendChild(el);
}
window.updateBar = updateBar;

/* Cảnh báo app đang chạy mà không có máy chủ đăng nhập. Cố tình khó bỏ qua:
   nếu bạn tưởng dữ liệu đang được bảo vệ mà thật ra không, đó là chuyện lớn. */
function noServerBar(reason){
  const el = document.createElement('div');
  el.className = 'updbar warn';
  el.innerHTML = `<span title="${esc(reason)}">⚠︎ Đang chạy KHÔNG có đăng nhập — dữ liệu chỉ nằm trên máy này.</span>
    <button class="btn sm" data-act="whyNoServer">Vì sao?</button>
    <button class="iconbtn" data-act="hideUpd" title="Để sau">✕</button>`;
  document.body.appendChild(el);
  el._reason = reason;
}
function whyNoServer(){
  const bar = document.querySelector('.updbar.warn');
  $('#modals').innerHTML = `<div class="ov" data-ovclose><div class="sheet">
    <h2>Chưa nối được máy chủ</h2>
    <div class="dim" style="margin:-8px 0 14px;line-height:1.65">${esc((bar && bar._reason) || '')}</div>
    <div class="dim" style="line-height:1.7">
      Vì vậy app đang chạy như một sổ tay chỉ lưu trong trình duyệt này:
      không hỏi mật khẩu, và dữ liệu <b>không</b> đồng bộ sang điện thoại.<br><br>
      Cách kiểm tra nhanh: mở <b>${esc(location.origin + location.pathname.replace(/[^/]*$/, ''))}api/index.php</b>
      trên một tab mới.<br>
      · Thấy <b>{"ok":false,"error":"Chỉ nhận POST"}</b> → PHP chạy tốt, lỗi nằm chỗ khác.<br>
      · Thấy trang lỗi 404 → thư mục <b>api/</b> chưa lên máy chủ.<br>
      · Thấy mã PHP hiện ra → hosting chưa bật PHP cho tên miền này.
    </div>
    <button class="btn full" style="margin-top:14px" data-close>Đóng</button></div></div>`;
}

function doRefresh(){
  /* bảo service worker bỏ bộ nhớ đệm rồi mới tải lại, nếu không
     lần tải kế tiếp vẫn có thể lấy đúng bản cũ đang lưu */
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (sw) sw.postMessage({type:'lifehub-refresh'});
  setTimeout(() => location.reload(), 220);
}

/* Nếu dữ liệu hỏng tới mức không vẽ được, đừng để lại trang trắng —
   phải còn đường lấy sao lưu ra trước khi xoá. */
function panic(err){
  document.getElementById('view').innerHTML = `
    <div class="empty" style="padding-top:50px">
      <b style="font-size:18px">App không mở được màn hình này</b>
      Dữ liệu có thể bị hỏng. Hãy xuất sao lưu trước, rồi thử xoá sạch.
      <div class="btns" style="justify-content:center;margin-top:18px">
        <button class="btn pri" data-act="export">⬇︎ Xuất sao lưu</button>
        <button class="btn dngr" data-act="wipe">Xoá sạch</button>
      </div>
      <div class="dim" style="margin-top:16px;font-size:11.5px">${esc(String(err && err.message || err))}</div>
    </div>`;
}

function boot(){
  load();
  applyShareLink();
  applyTheme();
  if (db.settings.role === 'staff') S.view = 'board';
  /* mở kèm ?demo để nạp sẵn dữ liệu mẫu (chỉ khi còn trống, không đè dữ liệu thật) */
  const wantDemo = /[?&]demo\b/.test(location.search);
  const isEmpty  = COLLECTIONS.every(k => !alive(db[k]).length);

  Sync.onChange(() => renderSide());
  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(() => {});
    /* Tin báo có bản mới có thể đã tới TRƯỚC khi file này chạy — thẻ script
       trong <head> bắt sẵn và để lại cờ ở đây. */
    if (window.__lhUpdate) updateBar();
  }

  /* Có thư mục api/ trên máy chủ thì phải đăng nhập mới vào được.
     Không có (mở bằng file, hay bản gộp một tệp) thì chạy như cũ. */
  Server.probe().then(m => {
    if (m === 'anon'){ Gate.show(); return; }
    /* Đang ở một địa chỉ web thật mà không nối được máy chủ nghĩa là app
       đang chạy KHÔNG có đăng nhập. Không được im lặng chuyện đó. */
    if (m === 'none' && Server.problem()) noServerBar(Server.problem());
    render();
    if (wantDemo && isEmpty) seedDemo();
    Sync.start();
    Notify.start();
    tgLoad().then(t => { if (t && S.view === 'settings') render(); });
  });
}
boot();
