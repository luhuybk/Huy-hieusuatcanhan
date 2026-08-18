/* ============================================================
   views.js — dựng HTML cho từng màn hình
   ============================================================ */
"use strict";

/* ---------------- mảnh dùng lại ---------------- */
function avatar(p, cls){
  return `<div class="av ${cls||''}" style="background:${TIERS[p.tier].color}">${esc(initials(p.name))}</div>`;
}
function ring(score){
  return `<div class="ring" style="--p:${score};--rc:${careColor(score)}"><i>${score}</i></div>`;
}
function areaChip(id, small){
  const a = areaOf(id); if (!a) return '';
  return `<span class="chip"><span class="sw" style="background:${esc(a.color)}"></span>${esc(a.name)}</span>`;
}
function areaDot(id){
  const a = areaOf(id); if (!a) return '';
  return `<span class="sw" style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${esc(a.color)}"></span>`;
}
function secHd(title, action){
  return `<div class="sec">${esc(title)}<span class="ln"></span>${action||''}</div>`;
}

/* ---------------- SIDEBAR ---------------- */
function renderSide(){
  const st = Sync.status();
  const dotCls = !st.on ? '' : st.state === 'error' ? 'bad' : st.state === 'syncing' ? 'sync' : 'ok';
  const stText = !st.on ? 'Chỉ lưu trên máy này'
               : st.state === 'error' ? 'Đồng bộ lỗi'
               : st.state === 'syncing' ? 'Đang đồng bộ…'
               : st.mode === 'server' ? 'Đã đồng bộ · máy chủ' : 'Đã đồng bộ · ' + st.workspace;

  const nDue  = dueTasks().length;
  const nLate = lateCards().length;
  const nStale = staleP().length;
  const isStaff = db.settings.role === 'staff';

  const navs = isStaff
    ? [['board','▦','Việc của tôi', nLate]]
    : [['dash','◉','Tổng quan', nDue + nLate],
       ['inbox','✎','Hộp ghi nhanh', inboxOpen().length],
       ['calendar','▤','Lịch tháng', 0],
       ['people','◍','Quan hệ', nStale],
       ['occasions','🎊','Dịp & lễ', dueOccasions().length],
       ['work','✓','Công việc', tasks().filter(t=>!t.done).length],
       ['ideas','💡','Ý tưởng', ideasDue().length || ideas().filter(i=>i.status==='doing').length],
       ['money','₫','Sổ tiền', 0],
       ['board','▦','Giao việc', nLate],
       ['review','◷','Ôn lại tuần', 0]];

  const as = areas();
  const cnt = id => byArea(tasks().filter(t=>!t.done), id).length
                  + byArea(cards().filter(c=>c.col!=='done'), id).length;

  $('#side').innerHTML = `
    <div class="side-hd">
      <div class="logo">LH</div>
      <div class="grow">
        <div class="nm">Life Hub</div>
        <div class="st"><span class="dot ${dotCls}"></span><span class="ell">${esc(stText)}</span></div>
      </div>
    </div>
    <div class="side-scroll">
      ${navs.map(([id,i,label,badge]) => `
        <button class="navi ${S.view===id||(id==='people'&&S.view==='person')?'on':''}" data-act="nav" data-id="${id}">
          <span class="i">${i}</span>${esc(label)}
          ${badge ? `<span class="b ${id==='dash'&&badge?'hot':''}">${badge}</span>` : ''}
        </button>`).join('')}

      <div class="side-lbl">Mảng việc <button data-act="addArea" title="Thêm mảng">＋</button></div>
      <button class="area-i ${S.area==='all'?'on':''}" data-act="area" data-id="all">
        <span class="sw" style="background:var(--tx3)"></span>Tất cả<span class="n">${cnt('all')}</span></button>
      ${as.map(a => `<button class="area-i ${S.area===a.id?'on':''}" data-act="area" data-id="${a.id}">
        <span class="sw" style="background:${esc(a.color)}"></span><span class="ell">${esc(a.name)}</span>
        <span class="n">${cnt(a.id)}</span></button>`).join('')}
      ${!as.length ? `<div class="dim" style="padding:4px 12px 0;line-height:1.5">
        Ví dụ: Gym, Barbershop, Kinh doanh online…</div>` : ''}
    </div>
    <div class="side-ft">
      <button data-act="theme">${db.settings.theme==='dark'?'☀︎ Sáng':'☾ Tối'}</button>
      <button data-act="nav" data-id="settings">⚙︎ Cài đặt</button>
    </div>`;
}

/* ---------------- TỔNG QUAN ---------------- */
function vDash(){
  const A = S.area;
  const due   = byArea(dueTasks(), A);
  const lcs   = byArea(lateCards(), A);
  const bdays = allBirthdays(45);
  const stale = staleP();
  const debts = people().map(p => ({p, b:balance(p.id)})).filter(x => x.b.diff > 0)
                  .sort((a,b) => b.b.diff - a.b.diff);
  const totalDebt = debts.reduce((s,x) => s + x.b.diff, 0);
  const doing = byArea(cards().filter(c => c.col === 'doing' || c.col === 'assigned'), A);

  if (!people().length && !tasks().length && !cards().length){
    return `<div class="empty" style="padding-top:60px">
        <b style="font-size:19px">Chào bạn 👋</b>
        Chưa có dữ liệu nào. Bắt đầu từ đâu cũng được.
        <div class="btns" style="justify-content:center;margin-top:18px">
          <button class="btn pri" data-act="addPerson">+ Thêm người</button>
          <button class="btn" data-act="addTask">+ Thêm việc</button>
          <button class="btn" data-act="seed">Dùng dữ liệu mẫu</button>
        </div></div>`;
  }

  let h = `<div class="stats">
    <div class="stat"><div class="v">${people().length}</div><div class="l">Quan hệ</div></div>
    <div class="stat"><div class="v" style="${due.length?'color:var(--warn)':''}">${due.length}</div><div class="l">Đến hạn</div></div>
    <div class="stat"><div class="v">${doing.length}</div><div class="l">Đang giao</div></div>
    <div class="stat"><div class="v" style="${totalDebt?'color:var(--bad)':''}">${moneyShort(totalDebt)}</div><div class="l">Nợ ân tình</div></div>
  </div>`;

  /* gợi ý chạm nhẹ — chống vô tâm */
  const touch = stale.slice().sort((a,b) =>
      (TIER_KEYS.indexOf(a.p.tier) - TIER_KEYS.indexOf(b.p.tier)) || (b.over - a.over)).slice(0,3);
  if (touch.length){
    h += secHd('Hôm nay nên hỏi thăm ai');
    h += `<div class="card" style="padding:12px">
      <div class="dim" style="margin-bottom:10px">Ba người đang cách chu kỳ chăm sóc xa nhất. Một tin nhắn là đủ.</div>
      ${touch.map(x => `<div class="row" style="padding:7px 0">
        ${avatar(x.p,'sm')}
        <div class="grow"><div class="ell" style="font-weight:600;font-size:14px">${esc(x.p.name)}</div>
        <div class="dim">${x.p.lastContact ? agoText(x.p.lastContact) : 'chưa ghi nhận lần nào'} · trễ ${x.over} ngày so với nhóm ${x.p.tier}</div></div>
        <button class="btn sm" data-act="quickLog" data-id="${x.p.id}">Ghi nhật ký</button>
      </div>`).join('')}
    </div>`;
  }

  const inb = inboxOpen();
  if (inb.length){
    h += secHd('Hộp ghi nhanh chờ phân loại', `<button data-act="nav" data-id="inbox">Mở hộp</button>`);
    h += `<div class="card" style="padding:12px">
      ${inb.slice(0,3).map(n => `<div class="row" style="padding:6px 0">
        <span class="sw" style="width:8px;height:8px;border-radius:3px;background:var(--warn);flex:none"></span>
        <div class="grow ell" style="font-size:14px">${esc((n.text||'').split('\n')[0])}</div>
        <span class="dim">${whenText(n.createdAt)}</span></div>`).join('')}
      ${inb.length > 3 ? `<div class="dim" style="margin-top:6px">+${inb.length - 3} mẩu nữa</div>` : ''}
    </div>`;
  }

  if (due.length){
    h += secHd('Việc đến hạn');
    h += due.sort((a,b) => (a.due||'').localeCompare(b.due||'')).slice(0,8).map(taskItem).join('');
  }
  if (lcs.length){
    h += secHd('Việc đã giao đang trễ');
    h += lcs.slice(0,6).map(c => `<div class="item" data-act="card" data-id="${c.id}">
        <div class="av sm" style="background:var(--bad)">${esc(initials(c.assignee||'?'))}</div>
        <div class="grow"><div class="t ell">${esc(c.title)}</div>
        <div class="s">${esc(c.assignee||'chưa giao')} · ${dueText(c.due)}</div></div>
        ${areaDot(c.areaId)}</div>`).join('');
  }
  const occs = dueOccasions();
  if (occs.length){
    h += secHd('Dịp sắp tới', `<button data-act="nav" data-id="occasions">Xem tất cả</button>`);
    h += occs.slice(0,4).map(occasionCard).join('');
  }
  if (bdays.length){
    h += secHd('Sinh nhật sắp tới');
    h += bdays.slice(0,7).map(x => `<div class="item"
        data-act="${x.kind === 'staff' ? 'staffPage' : 'person'}" data-id="${x.id}">
        <div class="av" style="background:${x.kind === 'staff' ? 'var(--acc)' : TIERS[x.tier].color}${
          x.kind === 'staff' ? ';color:#fff' : ''}">${esc(initials(x.name))}</div>
        <div class="grow"><div class="t ell">${esc(x.name)}</div>
        <div class="s">${fmtDate(x.birthday)} · ${esc(x.sub)}${x.kind === 'staff' ? ' · nhân viên' : ''}</div></div>
        <span class="chip ${x.d<=7?'warn':''}">${x.d===0?'hôm nay 🎂':'còn '+x.d+' ngày'}</span></div>`).join('');
  }
  if (debts.length){
    h += secHd('Ân tình chưa trả lại');
    h += debts.slice(0,6).map(x => `<div class="item" data-act="person" data-id="${x.p.id}">
        ${avatar(x.p)}<div class="grow"><div class="t ell">${esc(x.p.name)}</div>
        <div class="s">${x.b.open} món chưa cân lại</div></div>
        <span class="chip bad">${moneyShort(x.b.diff)}</span></div>`).join('');
  }
  return h;
}

/* ---------------- QUAN HỆ ---------------- */
function personCard(p){
  const b = balance(p.id);
  const sc = careScore(p);
  const bd = nextBirthday(p.birthday);
  return `<div class="pcard" data-act="person" data-id="${p.id}">
    <div class="bandtop" style="background:${TIERS[p.tier].color}"></div>
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      ${avatar(p)}${ring(sc)}
    </div>
    <div class="nm ell">${esc(p.name)}</div>
    <div class="sub ell">${p.lastContact ? 'gặp ' + agoText(p.lastContact) : 'chưa ghi nhận'}</div>
    <div class="foot">
      ${bd !== null && bd <= 30 ? `<span class="chip ${bd<=7?'warn':''}">🎂 ${bd===0?'hôm nay':bd+'n'}</span>` : ''}
      ${b.diff > 0 ? `<span class="chip bad">nợ ${moneyShort(b.diff)}</span>` : ''}
      ${b.diff < 0 ? `<span class="chip ok">+${moneyShort(-b.diff)}</span>` : ''}
      ${p.areaId ? areaChip(p.areaId) : ''}
    </div>
  </div>`;
}
function vPeople(){
  let list = people();
  if (S.q){ const q = norm(S.q);
    list = list.filter(p => norm(p.name+' '+(p.note||'')+' '+(p.tags||'')+' '+((areaOf(p.areaId)||{}).name||'')).includes(q)); }

  let h = `<input class="search" id="q" placeholder="Tìm tên, ghi chú, nhãn…" value="${esc(S.q)}">`;

  const totals = TIER_KEYS.map(k => list.filter(p => p.tier === k).length);
  if (!list.length)
    return h + `<div class="empty"><b>Không tìm thấy ai</b>Bấm nút + để thêm người mới.</div>`;

  TIER_KEYS.forEach((k, idx) => {
    const grp = list.filter(p => p.tier === k)
                    .sort((a,b) => careScore(a) - careScore(b) || a.name.localeCompare(b.name,'vi'));
    const t = TIERS[k];
    h += `<div class="tierhd">
        <div class="bdg" style="background:${t.color}">${k}</div>
        <div><div class="tt">${esc(t.name)}</div><div class="dd">${esc(t.desc)} · nhắc mỗi ${t.ping} ngày</div></div>
        <span class="ln"></span>
        <span class="chip">${totals[idx]}</span>
      </div>`;
    h += grp.length
      ? `<div class="pgrid">${grp.map(personCard).join('')}</div>`
      : `<div class="dim" style="padding:4px 2px 6px">Chưa có ai trong nhóm này.</div>`;
  });
  return h;
}

function vPerson(){
  const p = people().find(x => x.id === S.personId);
  if (!p){ S.view = 'people'; return vPeople(); }
  const b  = balance(p.id);
  const gs = giftsOf(p.id).sort((x,y) => (y.date||'').localeCompare(x.date||''));
  const bd = nextBirthday(p.birthday);
  const sc = careScore(p);
  const logs = (p.logs||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));

  let h = `<div class="card">
    <div class="row" style="align-items:flex-start">
      ${avatar(p,'lg')}
      <div class="grow" style="padding-top:2px">
        <div style="font-size:19px;font-weight:700;letter-spacing:-.3px">${esc(p.name)}</div>
        <div class="row" style="gap:6px;margin-top:7px;flex-wrap:wrap">
          <span class="chip" style="background:${TIERS[p.tier].color};color:#12151b">${p.tier} · ${TIERS[p.tier].name}</span>
          ${p.birthday ? `<span class="chip">🎂 ${fmtDate(p.birthday)}${bd!==null&&bd<=45?` · còn ${bd}n`:''}</span>` : ''}
          ${p.tags ? `<span class="chip">${esc(p.tags)}</span>` : ''}
          ${areaChip(p.areaId)}
        </div>
      </div>
      ${ring(sc)}
    </div>
    ${p.note ? `<div class="muted" style="margin-top:12px;font-size:13.5px">${nl(p.note)}</div>` : ''}
    <div class="btns" style="margin-top:14px">
      <button class="btn sm pri" data-act="quickLog" data-id="${p.id}">✎ Ghi nhật ký</button>
      ${p.phone ? `<a class="btn sm" href="tel:${esc(p.phone)}">📞 Gọi</a>` : ''}
      <button class="btn sm" data-act="editPerson" data-id="${p.id}">Sửa</button>
      <button class="btn sm" data-act="chTier" data-id="${p.id}">Đổi nhóm</button>
      <button class="btn sm dngr" data-act="delPerson" data-id="${p.id}">Xoá</button>
    </div>
    <div class="dim" style="margin-top:11px">
      Chăm sóc ${sc}/100 · liên lạc gần nhất ${p.lastContact ? agoText(p.lastContact)+' ('+fmtDate(p.lastContact)+')' : 'chưa ghi nhận'}
    </div>
  </div>`;

  /* cân bằng trao đổi */
  h += secHd('Cân bằng trao đổi');
  h += `<div class="card">
    <div class="row">
      <div style="flex:1;text-align:center"><div style="font-size:15.5px;font-weight:700">${money(b.in)}</div><div class="dim">Họ trao mình</div></div>
      <div style="flex:1;text-align:center"><div style="font-size:15.5px;font-weight:700">${money(b.out)}</div><div class="dim">Mình trao lại</div></div>
      <div style="flex:1;text-align:center">
        <div style="font-size:15.5px;font-weight:700;color:${b.diff>0?'var(--bad)':b.diff<0?'var(--ok)':'var(--tx2)'}">${moneyShort(Math.abs(b.diff))}</div>
        <div class="dim">${b.diff>0?'mình còn nợ':b.diff<0?'mình trao dư':'cân bằng'}</div>
      </div>
    </div>
    <div class="btns" style="margin-top:14px">
      <button class="btn sm pri grow" data-act="addGift" data-id="${p.id}" data-dir="in">← Họ tặng mình</button>
      <button class="btn sm grow" data-act="addGift" data-id="${p.id}" data-dir="out">Mình tặng họ →</button>
    </div>
  </div>`;

  if (gs.length){
    h += secHd('Nhật ký trao đổi (' + gs.length + ')');
    h += gs.map(g => {
      const isIn = g.dir === 'in', done = isIn && g.repay;
      return `<div class="card" style="padding:12px;margin-bottom:8px">
        <div class="row" style="align-items:flex-start">
          <div class="cb ${done?'on':''}" ${isIn?`data-act="repay" data-id="${g.id}"`:''} style="margin-top:2px">✓</div>
          <div class="grow">
            <div style="font-weight:600;font-size:14.5px">${isIn?'←':'→'} ${esc(g.title)}</div>
            <div class="dim" style="margin-top:2px">${money(g.value)} · ${fmtDate(g.date)}${g.occasion?' · '+esc(g.occasion):''}</div>
            ${g.note ? `<div class="dim" style="margin-top:4px">${nl(g.note)}</div>` : ''}
            ${done ? `<div class="chip ok" style="margin-top:7px">đã trả: ${esc(g.repay.title)} · ${money(g.repay.value)} · ${fmtDate(g.repay.date)}</div>`
                   : isIn ? `<div class="chip warn" style="margin-top:7px">chưa trả lại</div>` : ''}
          </div>
          <button class="iconbtn" data-act="giftMenu" data-id="${g.id}">⋯</button>
        </div></div>`;
    }).join('');
  }

  /* nhật ký gặp gỡ */
  h += secHd('Nhật ký gặp gỡ (' + logs.length + ')',
             `<button data-act="quickLog" data-id="${p.id}">+ Ghi</button>`);
  h += logs.length ? `<div class="card"><div class="tl">${logs.map(l => `
      <div class="e">
        <div class="d">${fmtDate(l.date)} · ${esc((LOG_KINDS[l.kind]||'').replace(/^\S+\s/,''))}</div>
        <div class="x">${nl(l.text || LOG_KINDS[l.kind] || '')}</div>
        <button class="dim" data-act="delLog" data-id="${p.id}" data-lid="${l.id}" style="font-size:11px">xoá</button>
      </div>`).join('')}</div></div>`
    : `<div class="empty" style="padding:20px">Chưa có ghi chép nào. Mỗi lần cà phê, gọi điện, giúp đỡ… ghi một dòng là sau này nhớ hết.</div>`;

  if (p.history && p.history.length){
    h += secHd('Lịch sử đổi nhóm');
    h += `<div class="card">` + p.history.slice().reverse().map(x =>
      `<div class="row dim" style="padding:3px 0"><span class="grow">${fmtDate(x.date)}</span>
       <span>${x.from ? x.from + ' → ' : 'khởi tạo '}<b style="color:${TIERS[x.to]?TIERS[x.to].color:''}">${x.to}</b></span></div>`).join('') + `</div>`;
  }
  return h;
}

/* ---------------- CÔNG VIỆC ---------------- */
function taskItem(t){
  const d = t.due ? dayDiff(t.due) : null;
  const cls = t.done ? '' : d === null ? '' : d < 0 ? 'bad' : d === 0 ? 'warn' : '';
  const meta = [
    t.prio === 'high' && !t.done ? `<span class="chip bad">gấp</span>` : '',
    t.repeat ? `<span class="chip">↻ ${esc(REPEATS[t.repeat]||'')}</span>` : '',
    t.remindAt && !t.done && !snoozeOn(t) ? `<span class="chip">🔔 ${esc(t.remindAt)}</span>` : '',
    !t.done && snoozeOn(t) ? `<span class="chip warn">⏰ ${esc(snoozeText(t.snoozeUntil))}</span>` : '',
    t.streak > 1 ? `<span class="chip"><span class="streak">🔥 ${t.streak}</span></span>` : '',
    t.note ? `<span class="chip">${esc(t.note.slice(0,28))}</span>` : ''
  ].filter(Boolean).join('');
  return `<div class="item">
    <div class="cb ${t.done?'on':''}" data-act="toggleTask" data-id="${t.id}">✓</div>
    <div class="grow" data-act="editTask" data-id="${t.id}">
      <div class="t ell" style="${t.done?'text-decoration:line-through;opacity:.5':''}">${areaDot(t.areaId)} ${esc(t.title)}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>
    ${t.due && !t.done ? `<span class="chip ${cls}">${dueText(t.due)}</span>` : ''}
    ${t.done ? '' : `<button class="iconbtn" data-act="snooze" data-k="tasks" data-id="${t.id}"
       title="Dời nhắc lại">⏰</button>`}
  </div>`;
}
function vWork(){
  const A = S.area;
  const all  = byArea(tasks(), A);
  const open = all.filter(t => !t.done);
  const done = all.filter(t => t.done).sort((a,b) => (b.doneAt||'').localeCompare(a.doneAt||''));
  if (!all.length) return `<div class="empty"><b>Chưa có việc nào</b>Bấm + để thêm. Việc lặp lại (tập gym, đóng tiền nhà…) chỉ cần tạo một lần.</div>`;
  const g = {late:[], today:[], soon:[], none:[]};
  for (const t of open){
    const d = t.due ? dayDiff(t.due) : null;
    if (d === null) g.none.push(t); else if (d < 0) g.late.push(t); else if (d === 0) g.today.push(t); else g.soon.push(t);
  }
  const byPrio = a => a.sort((x,y) => ['high','mid','low'].indexOf(x.prio||'mid') - ['high','mid','low'].indexOf(y.prio||'mid'));
  const sec = (t, arr) => arr.length ? secHd(t + ' (' + arr.length + ')') + arr.map(taskItem).join('') : '';
  let h = '';
  h += sec('Quá hạn', g.late.sort((a,b) => a.due.localeCompare(b.due)));
  h += sec('Hôm nay', byPrio(g.today));
  h += sec('Sắp tới', g.soon.sort((a,b) => a.due.localeCompare(b.due)));
  h += sec('Không hạn', byPrio(g.none));
  if (done.length) h += secHd('Đã xong (' + done.length + ')') + done.slice(0,15).map(taskItem).join('');
  return h;
}

/* ---------------- Ý TƯỞNG ---------------- */
/* Tách khỏi Công việc thành màn riêng: ý tưởng là chỗ nghĩ dài hạn, phải mở
   được bằng một cú bấm chứ không nằm sau một tab của màn khác. */
const IDEA_ORDER = ['doing','explore','seed','done','drop'];
function ideaCard(i){
  const due = ideaDue(i);
  const rv  = String(i.reviewAt || '').slice(0,10);
  return `
    <div class="card" style="margin-bottom:10px" data-act="editIdea" data-id="${i.id}">
      <div class="row">
        <div class="grow"><div style="font-weight:650;font-size:15px">${areaDot(i.areaId)} ${esc(i.title)}</div></div>
        <span class="chip ${i.status==='doing'?'acc':i.status==='done'?'ok':''}">${IDEA_ST[i.status]||''}</span>
      </div>
      ${rv && !due ? `<div class="dim" style="margin-top:6px;font-size:12.5px">⏳ xem lại ${fmtDate(rv)}</div>` : ''}
      ${i.detail ? `<div class="muted" style="margin-top:8px;font-size:13.5px">${nl(i.detail)}</div>` : ''}
      ${i.plan ? `<div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:10px;font-size:13px">
        <div class="dim" style="margin-bottom:4px;font-weight:700">HƯỚNG TRIỂN KHAI</div>${nl(i.plan)}</div>` : ''}
      ${due ? ideaReviewBtns(i.id, rv) : ''}
    </div>`;
}
/* Ba nút y hệt ba nút dưới tin Telegram. Hai dòng chứ không một — ba nút
   một hàng là bị chèn trên máy 375px, lỗi đã gặp với hàng nút dời nhắc. */
function ideaReviewBtns(id, rv){
  const late = rv ? -dayDiff(rv) : 0;
  return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bg4)">
    <div class="dim" style="margin-bottom:7px;font-size:12.5px">Tới hẹn xem lại${
      late > 0 ? ' — hẹn từ ' + fmtDate(rv) + ' (' + late + ' ngày trước)' : ''} — làm hay bỏ?</div>
    <div class="btns" style="margin-bottom:6px">
      <button class="btn sm grow" data-act="ideaRev" data-r="go"   data-id="${id}">▶ Triển khai</button>
      <button class="btn sm grow" data-act="ideaRev" data-r="drop" data-id="${id}">🗄 Gác lại</button>
    </div>
    <div class="btns">
      <button class="btn sm grow" data-act="ideaRev" data-r="m3" data-id="${id}">⏰ Nhắc lại sau 3 tháng</button>
    </div></div>`;
}
function vIdeas(){
  const list = byArea(ideas(), S.area);
  if (!list.length) return `<div class="empty"><b>Chưa có ý tưởng nào</b>Ghi lại ý tưởng cùng hướng triển khai để không quên.</div>`;

  /* Chỉ ba nhóm. Trạng thái chi tiết đã có sẵn trên chip mỗi thẻ, thêm tab
     nữa là hàng tab tràn ngang trên điện thoại — lỗi đã gặp một lần rồi. */
  const kho  = i => i.status === 'done' || i.status === 'drop';
  const pick = {live: i => !kho(i), doing: i => i.status === 'doing', kho};
  const tabs = [['live','Đang nuôi'], ['doing','Đang triển khai'], ['kho','Kho']];
  let h = `<div class="tabs">` + tabs.map(([id,label]) =>
    `<button class="tab ${S.ideatab===id?'on':''}" data-act="ideatab" data-id="${id}">${label}
      <span class="n">${list.filter(pick[id]).length}</span></button>`).join('') + `</div>`;

  const shown = list.filter(pick[S.ideatab] || pick.live);
  if (!shown.length) return h + `<div class="empty"><b>Trống</b>Chưa có ý tưởng nào ở nhóm này.</div>`;
  const rank = (a,b) => (IDEA_ORDER.indexOf(a.status) - IDEA_ORDER.indexOf(b.status))
                     || (b.createdAt||'').localeCompare(a.createdAt||'');

  /* Tới hẹn thì tách lên đầu, đừng để lẫn vào danh sách — cả điểm của
     tính năng này là bắt mình phải quyết, chứ không phải lướt qua. */
  const due  = shown.filter(ideaDue).sort((a,b) => (a.reviewAt||'').localeCompare(b.reviewAt||''));
  const rest = shown.filter(i => !ideaDue(i)).sort(rank);
  if (due.length) h += secHd('Cần xem lại (' + due.length + ')') + due.map(ideaCard).join('');
  if (rest.length) h += (due.length ? secHd('Còn lại (' + rest.length + ')') : '') + rest.map(ideaCard).join('');
  return h;
}

/* ---------------- GIAO VIỆC ---------------- */
function vBoard(){
  const isStaff = db.settings.role === 'staff';
  let list = byArea(cards(), S.area);
  if (isStaff) list = list.filter(c => c.assignee === db.settings.staffName);

  const names = [...new Set([...staff().map(s => s.name), ...cards().map(c => c.assignee).filter(Boolean)])];
  let h = '';
  if (!isStaff){
    h += `<div class="tabs">
      <button class="tab ${S.assignee==='all'?'on':''}" data-act="asg" data-id="all">Tất cả <span class="n">${list.length}</span></button>` +
      names.map(n => `<button class="tab ${S.assignee===n?'on':''}" data-act="asg" data-id="${esc(n)}">${esc(n)}
        <span class="n">${list.filter(c=>c.assignee===n).length}</span></button>`).join('') +
      `<button class="tab" data-act="staffBox">＋ Nhân sự</button></div>`;
  }
  if (S.assignee !== 'all') list = list.filter(c => c.assignee === S.assignee);

  if (!cards().length)
    h += `<div class="empty"><b>Bảng còn trống</b>Tạo thẻ việc rồi chuyển dần qua các cột.
      <div class="btns" style="justify-content:center;margin-top:14px">
      <button class="btn pri" data-act="addCard" data-id="idea">+ Thẻ đầu tiên</button></div></div>`;

  h += `<div class="board">` + COLS.map((col, ci) => {
    const cs = list.filter(c => c.col === col.id);
    return `<div class="col">
      <h3>${esc(col.label)}<span class="n">${cs.length}</span></h3>
      ${cs.map(c => {
        const late = c.due && c.col !== 'done' && dayDiff(c.due) < 0;
        return `<div class="kc">
          <div data-act="card" data-id="${c.id}">
            <div class="t">${areaDot(c.areaId)} ${esc(c.title)}</div>
            ${c.desc ? `<div class="dim ell" style="margin-top:4px">${esc(c.desc)}</div>` : ''}
            <div class="meta">
              <span class="chip">${esc(c.assignee || 'chưa giao')}</span>
              ${c.due ? `<span class="chip ${late?'bad':''}">${dueText(c.due)}</span>` : ''}
              ${c.prio === 'high' ? `<span class="chip bad">gấp</span>` : ''}
              ${c.remindAt && c.col !== 'done' && !snoozeOn(c) ? `<span class="chip">🔔 ${esc(c.remindAt)}</span>` : ''}
              ${c.col !== 'done' && snoozeOn(c) ? `<span class="chip warn">⏰ ${esc(snoozeText(c.snoozeUntil))}</span>` : ''}
              ${c.extra ? `<span class="chip ${c.extraPaidDate?'ok':'warn'}">⌁ ngoài luồng${
                c.extraPay ? ' · ' + moneyShort(c.extraPay) : ''}${c.extraPaidDate ? ' ✓' : ''}</span>` : ''}
            </div>
            ${c.progress ? `<div class="pg"><i style="width:${Math.min(100,c.progress)}%"></i></div>` : ''}
          </div>
          <div class="mv">
            ${ci > 0 ? `<button data-act="mv" data-id="${c.id}" data-d="-1">‹</button>` : ''}
            ${ci < COLS.length-1 ? `<button data-act="mv" data-id="${c.id}" data-d="1">${esc(COLS[ci+1].label)} ›</button>` : ''}
            ${c.col !== 'done' ? `<button data-act="snooze" data-k="cards" data-id="${c.id}" title="Dời nhắc lại">⏰</button>` : ''}
          </div>
        </div>`;
      }).join('')}
      <button class="btn sm full" style="background:transparent;color:var(--tx3)" data-act="addCard" data-id="${col.id}">+ Thêm thẻ</button>
    </div>`;
  }).join('') + `</div>`;

  /* ---- việc ngoài luồng: tiền công cần chi thêm ---- */
  if (!isStaff && extraCards().length){
    const tot = extraTotals();
    h += secHd('Việc ngoài luồng · tiền cần chi thêm');
    h += `<div class="card" style="margin-bottom:10px">
      <div class="row">
        <div style="flex:1;text-align:center">
          <div style="font-size:17px;font-weight:700;color:${tot.owed?'var(--warn)':'var(--tx2)'}">${money(tot.owed)}</div>
          <div class="dim">chưa trả (${tot.unpaid} việc)</div></div>
        <div style="flex:1;text-align:center">
          <div style="font-size:17px;font-weight:700;color:var(--ok)">${money(tot.paid)}</div>
          <div class="dim">đã trả</div></div>
      </div>
      <div class="dim" style="margin-top:10px">Việc giao thêm ngoài nhiệm vụ thường ngày.
        Tick ô vuông khi đã chi tiền hoặc thưởng cho người làm.</div>
    </div>`;

    h += extraByStaff().map(g => `
      <div class="card" style="margin-bottom:10px;padding:12px">
        <div class="row" style="margin-bottom:6px">
          <div class="av sm" style="background:var(--acc);color:#fff">${esc(initials(g.who))}</div>
          <div class="grow" ${staffByName(g.who) ? `data-act="staffPage" data-id="${staffByName(g.who).id}"` : ''}>
            <div style="font-weight:650;font-size:14.5px">${esc(g.who)}${staffByName(g.who) ? ' ›' : ''}</div>
            <div class="dim">${g.unpaid} việc chưa trả · ${g.count - g.unpaid} đã trả</div></div>
          ${g.owed ? `<span class="chip warn">còn ${moneyShort(g.owed)}</span>
            <button class="btn sm" data-act="payAllExtra" data-who="${esc(g.who)}">Trả hết</button>`
            : `<span class="chip ok">đã thanh toán đủ</span>`}
        </div>
        ${g.items.sort((a,b) => (a.extraPaidDate?1:0) - (b.extraPaidDate?1:0)).map(c => `
          <div class="row" style="padding:7px 0;border-top:1px solid var(--line)">
            <div class="cb ${c.extraPaidDate?'on':''}" data-act="payExtra" data-id="${c.id}">✓</div>
            <div class="grow" data-act="card" data-id="${c.id}">
              <div class="ell" style="font-size:14px;font-weight:600;${c.extraPaidDate?'opacity:.6':''}">${esc(c.title)}</div>
              <div class="dim">${(COLS.find(x => x.id === c.col)||{}).label}${
                c.extraPaidDate ? ' · đã trả ' + fmtDate(c.extraPaidDate) : c.due ? ' · ' + dueText(c.due) : ''}</div>
            </div>
            <span class="chip ${c.extraPaidDate?'ok':'warn'}">${c.extraPay ? moneyShort(c.extraPay) : 'chưa định giá'}</span>
          </div>`).join('')}
      </div>`).join('');
  }

  if (!isStaff && names.length){
    h += secHd('Tiến độ theo người');
    h += names.map(n => {
      const mine = byArea(cards(), S.area).filter(c => c.assignee === n);
      const dn = mine.filter(c => c.col === 'done').length;
      const late = mine.filter(c => c.col !== 'done' && c.due && dayDiff(c.due) < 0).length;
      const pct = mine.length ? Math.round(dn / mine.length * 100) : 0;
      const rec = staffByName(n);
      const owed = extraTotals(mine.filter(c => c.extra)).owed;
      return `<div class="card" style="padding:12px;margin-bottom:8px">
        <div class="row">
          <div class="av sm" style="background:var(--acc);color:#fff">${esc(initials(n))}</div>
          <div class="grow" ${rec ? `data-act="staffPage" data-id="${rec.id}"` : `data-act="asg" data-id="${esc(n)}"`}>
            <div style="font-weight:600;font-size:14px">${esc(n)}${rec ? ' ›' : ''}</div>
            <div class="dim">${dn}/${mine.length} xong${late?` · ${late} trễ`:''}${
              owed ? ` · nợ công ${moneyShort(owed)}` : ''}</div></div>
          <button class="btn sm" data-act="asg" data-id="${esc(n)}">Lọc</button>
          <span class="chip ${pct===100&&mine.length?'ok':late?'bad':''}">${pct}%</span></div>
        <div class="pg"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
  }
  return h;
}

/* ---------------- DỊP & LỄ ---------------- */
const MONTHS = ['','Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];

function occasionCard(x){
  const {o, iso, d} = x;
  const dd = iso.slice(8,10), mo = +iso.slice(5,7);
  const soon = d <= (o.remind ?? 7);
  const ppl = (o.personIds||[]).map(id => people().find(p => p.id === id)).filter(Boolean);
  return `<div class="occ">
    <div class="hd">
      <div class="cal"><div class="dd">${dd}</div><div class="mo">${MONTHS[mo]}</div></div>
      <div class="grow" data-act="editOcc" data-id="${o.id}">
        <div style="font-weight:650;font-size:15px">${esc(o.title)}</div>
        <div class="dim" style="margin-top:3px">
          ${fmtDate(iso)}${o.cal === 'lunar' ? ` · ${o.day}/${o.month} âm lịch` : ''}
          ${o.note ? ' · ' + esc(o.note) : ''}
        </div>
      </div>
      <span class="chip ${d===0?'bad':soon?'warn':''}">${d===0?'hôm nay':'còn '+d+' ngày'}</span>
    </div>
    ${ppl.length ? `<div class="who">${ppl.map(p => {
      const s = suggestGift(p.id, o.title);
      return `<div class="r" data-act="person" data-id="${p.id}">
        ${avatar(p,'sm')}
        <div class="grow"><div class="ell" style="font-weight:600;font-size:13.5px">${esc(p.name)}</div>
          <div class="dim">${s ? esc(s.why) : ''}</div></div>
        ${s && s.amount ? `<span class="chip acc">≈ ${moneyShort(s.amount)}</span>` : ''}
      </div>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function vOccasions(){
  const list = upcomingOccasions(400);
  let h = `<div class="card" style="margin-bottom:12px">
    <div class="row">
      <div class="grow">
        <div style="font-weight:650">Hôm nay: ${fmtDate(today())} · ${lunarLabelOf(today())}</div>
        <div class="dim" style="margin-top:3px">Giỗ và Tết tính theo âm lịch, app tự quy ra ngày dương mỗi năm.</div>
      </div>
    </div>
    <div class="btns" style="margin-top:12px">
      <button class="btn sm pri" data-act="addOcc">+ Thêm dịp</button>
      <button class="btn sm" data-act="presetOcc">📅 Chọn từ danh sách lễ VN</button>
    </div>
  </div>`;

  if (!list.length)
    return h + `<div class="empty"><b>Chưa có dịp nào</b>
      Thêm giỗ, Tết, kỷ niệm cưới, 20/11… rồi gắn người liên quan.<br>
      App sẽ nhắc trước và gợi ý mức quà dựa trên lịch sử trao đổi.</div>`;

  const due = list.filter(x => x.d <= (x.o.remind ?? 7));
  const rest = list.filter(x => x.d > (x.o.remind ?? 7));
  if (due.length){ h += secHd('Đang tới — cần chuẩn bị'); h += due.map(occasionCard).join(''); }
  if (rest.length){ h += secHd('Còn xa (' + rest.length + ')'); h += rest.map(occasionCard).join(''); }
  return h;
}

/* ---------------- HỘP GHI NHANH ---------------- */
function whenText(isoDT){
  if (!isoDT) return '';
  const d = String(isoDT).slice(0,10);
  const hm = String(isoDT).slice(11,16);
  const dd = dayDiff(d);
  const day = dd === 0 ? 'hôm nay' : dd === -1 ? 'hôm qua' : agoText(d);
  return hm ? `${day} · ${hm}` : day;
}
function inboxCard(n){
  const first = (n.text || '').split('\n')[0];
  const rest  = (n.text || '').split('\n').slice(1).join('\n').trim();
  if (n.processed){
    return `<div class="item">
      <div class="cb on" data-act="inboxReopen" data-id="${n.id}">✓</div>
      <div class="grow"><div class="t ell" style="text-decoration:line-through;opacity:.55">${esc(first)}</div>
        <div class="s">${whenText(n.createdAt)}${n.processedAs ? ' · đã chuyển thành ' + esc(n.processedAs) : ''}</div></div>
    </div>`;
  }
  return `<div class="card" style="margin-bottom:10px">
    <div style="font-size:15px;font-weight:600;line-height:1.45">${nl(first)}</div>
    ${rest ? `<div class="muted" style="margin-top:6px;font-size:13.5px">${nl(rest)}</div>` : ''}
    <div class="dim" style="margin-top:8px">${whenText(n.createdAt)}</div>
    <div class="btns" style="margin-top:11px">
      <button class="btn sm pri" data-act="inboxTo" data-k="task"  data-id="${n.id}">✓ Việc</button>
      <button class="btn sm"     data-act="inboxTo" data-k="idea"  data-id="${n.id}">💡 Ý tưởng</button>
      <button class="btn sm"     data-act="inboxTo" data-k="card"  data-id="${n.id}">▦ Giao việc</button>
      <button class="btn sm"     data-act="inboxTo" data-k="log"   data-id="${n.id}">◍ Nhật ký</button>
      <button class="btn sm"     data-act="inboxDone" data-id="${n.id}">Xong, khỏi chuyển</button>
      <button class="btn sm dngr" data-act="inboxDel" data-id="${n.id}">Xoá</button>
    </div>
  </div>`;
}
function vInbox(){
  const open = inboxOpen();
  const done = inbox().filter(n => n.processed);

  let h = `<div class="card" style="margin-bottom:14px">
    <div class="row">
      <div class="grow">
        <div style="font-weight:650">Nghĩ gì ghi nấy, phân loại sau</div>
        <div class="dim" style="margin-top:3px">Không phải chọn mảng, hạn hay loại — chỉ gõ (hoặc nói) rồi lưu.
          Lúc rảnh quay lại đẩy từng mẩu về đúng chỗ.</div>
      </div>
    </div>
    <div class="btns" style="margin-top:12px">
      <button class="btn sm pri" data-act="capture">✎ Ghi nhanh</button>
      <span class="chip">phím tắt: Ctrl/Cmd + J</span>
    </div>
  </div>`;

  if (!open.length && !done.length)
    return h + `<div class="empty"><b>Hộp đang trống</b>
      Ý tưởng chợt nghĩ ra lúc lái xe, câu ai đó nhờ, món cần mua…<br>ghi vào đây trước đã, khỏi quên.</div>`;

  if (open.length){ h += secHd('Chờ phân loại (' + open.length + ')'); h += open.map(inboxCard).join(''); }
  else h += `<div class="empty" style="padding:24px"><b>Hộp sạch 🎉</b>Không còn mẩu nào chờ phân loại.</div>`;

  if (done.length){
    h += secHd('Đã xử lý (' + done.length + ')',
      `<button data-act="inboxClear">Dọn hết</button>`);
    h += done.slice(0,20).map(inboxCard).join('');
  }
  return h;
}

/* ---------------- LỊCH THÁNG ---------------- */
const WD = ['T2','T3','T4','T5','T6','T7','CN'];
const EV_ICON = {task:'✓', card:'▦', occasion:'🎊', birthday:'🎂', staffBirthday:'🎂'};

function vCalendar(){
  const [Y, M] = S.calMonth.split('-').map(Number);
  const first = new Date(Y, M - 1, 1);
  const daysIn = new Date(Y, M, 0).getDate();
  const lead = (first.getDay() + 6) % 7;              // tuần bắt đầu từ Thứ 2
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const iso = d => `${Y}-${String(M).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  /* lấy rộng ra hai đầu để các ô đệm cũng có dữ liệu */
  const from = addDays(iso(1), -7), to = addDays(iso(daysIn), 7);
  const map = calendarMap(from, to, S.area);
  const tISO = today();

  let grid = WD.map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < cells; i++){
    const dn = i - lead + 1;
    const off = dn < 1 || dn > daysIn;
    const d = off ? addDays(iso(1), dn - 1) : iso(dn);
    const evs = map[d] || [];
    const lu = solar2lunar(+d.slice(8), +d.slice(5,7), +d.slice(0,4));
    const luTxt = lu[0] === 1 ? `${lu[0]}/${lu[1]}` : lu[0];
    grid += `<div class="cell ${off?'off':''} ${d===tISO?'today':''} ${d===S.calDay?'sel':''}"
        data-act="calDay" data-id="${d}">
      <div class="n">${+d.slice(8)}<span class="lu">${luTxt}</span></div>
      ${evs.length ? `<div class="dots">${evs.slice(0,6).map(e =>
          `<i style="background:${e.color};${e.done?'opacity:.35':''}"></i>`).join('')}</div>` : ''}
      ${evs.slice(0,3).map(e => `<div class="ev ${e.done||e.ghost?'dim':''}"
          style="border-left:2px solid ${e.color}${e.done?';text-decoration:line-through':''}"
          >${e.done ? '✔' : (EV_ICON[e.kind]||'')} ${esc(e.title)}</div>`).join('')}
      ${evs.length > 3 ? `<div class="more">+${evs.length - 3} nữa</div>` : ''}
    </div>`;
  }

  const sel = S.calDay || tISO;
  const selEvs = map[sel] || [];
  const selLu = lunarLabelOf(sel);

  return `
  <div class="calhd">
    <button class="iconbtn" data-act="calNav" data-id="-1">‹</button>
    <div class="mth">Tháng ${M}/${Y}</div>
    <button class="iconbtn" data-act="calNav" data-id="1">›</button>
    <button class="btn sm" data-act="calToday">Hôm nay</button>
  </div>
  <div class="calgrid">${grid}</div>

  <div class="daylist">
    <div class="sec">
      <span>${sel === tISO ? 'Hôm nay' : 'Ngày đã chọn'}</span><span class="ln"></span>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="dayhd">${fmtDate(sel)} · ${WD[(new Date(sel+'T00:00:00').getDay()+6)%7]}</div>
      <div class="dim">${selLu}</div>
    </div>
    ${selEvs.length ? selEvs.map(e => {
      const act = e.kind === 'task' ? `data-act="editTask" data-id="${e.id}"`
                : e.kind === 'card' ? `data-act="card" data-id="${e.id}"`
                : e.kind === 'occasion' ? `data-act="editOcc" data-id="${e.id}"`
                : e.kind === 'staffBirthday' ? `data-act="staffPage" data-id="${e.id}"`
                : `data-act="person" data-id="${e.id}"`;
      /* việc và thẻ tick được ngay tại đây; kỳ lặp chưa tới thì không,
         tránh làm hỏng chuỗi và ngày hạn của kỳ đang chờ */
      const lead = e.canTick
        ? `<div class="cb ${e.done?'on':''}" data-act="${e.kind === 'task' ? 'toggleTask' : 'toggleCard'}"
             data-id="${e.id}">✓</div>`
        : `<span class="sw" style="width:10px;height:10px;border-radius:3px;background:${e.color};
             flex:none;${e.done?'opacity:.5':''}"></span>`;
      const note = e.record ? ' · đã làm xong' : e.ghost ? ' · kỳ lặp sắp tới' : '';
      return `<div class="item">
        ${lead}
        <div class="grow" ${act}>
          <div class="t ell" style="${e.done?'text-decoration:line-through;opacity:.55':''}">${esc(e.title)}</div>
          <div class="s">${KIND_LABEL[e.kind] || 'Sự kiện'}${note}${
            e.who ? ' · ' + esc(e.who) : ''}${e.cal === 'lunar' ? ' · âm lịch' : ''}</div>
        </div>
        ${e.prio === 'high' && !e.done ? `<span class="chip bad">gấp</span>` : ''}
      </div>`;
    }).join('') : `<div class="empty" style="padding:22px">Ngày này trống.</div>`}
    <button class="btn sm full" style="margin-top:4px" data-act="addTaskOn" data-id="${sel}">
      + Thêm việc vào ngày ${fmtDate(sel)}</button>
  </div>`;
}

/* ---------------- TÌM KIẾM TOÀN CỤC ---------------- */
function searchBox(){
  $('#modals').innerHTML = `
    <div class="ov" data-ovclose>
      <div class="sheet" style="max-height:86vh">
        <div class="srch">
          <input id="sq" placeholder="Tìm người, việc, thẻ, ý tưởng, dịp… (gõ không dấu cũng được)"
                 autocomplete="off" autocorrect="off" spellcheck="false">
        </div>
        <div class="sres" id="sres"></div>
      </div>
    </div>`;
  const inp = $('#sq'), box = $('#sres');

  const paint = () => {
    const q = inp.value.trim();
    if (!q){
      box.innerHTML = `<div class="empty" style="padding:26px">
        Gõ để tìm khắp nơi. Ví dụ: <kbd>tuan</kbd>, <kbd>gym</kbd>, <kbd>tet</kbd>, <kbd>bao gia</kbd>.</div>`;
      return;
    }
    const res = searchAll(q, 40);
    if (!res.length){ box.innerHTML = `<div class="empty" style="padding:26px">Không tìm thấy “${esc(q)}”.</div>`; return; }
    const groups = {};
    res.forEach(r => (groups[r.kind] = groups[r.kind] || []).push(r));
    box.innerHTML = Object.keys(groups).map(k =>
      `<div class="skhd">${KIND_LABEL[k]} (${groups[k].length})</div>` +
      groups[k].map(r => `<div class="sitem" data-act="goto" data-k="${r.kind}" data-id="${r.id}">
        <span class="stripe" style="background:${r.color}"></span>
        <div class="grow"><div class="t ell">${esc(r.title)}</div>
          <div class="s ell">${esc(r.sub || '')}</div></div>
      </div>`).join('')).join('');
  };

  inp.addEventListener('input', paint);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter'){
      const f = box.querySelector('.sitem');
      if (f) f.click();
    }
  });
  paint();
  setTimeout(() => inp.focus(), 60);
}

/* ---------------- CÂN BẰNG MẢNG ---------------- */
function balanceBlock(days){
  const st = areaStats(days);
  if (st.rows.length < 2) return '';
  const active = st.rows.filter(r => r.touch || r.open);
  if (!active.length) return '';
  const col = r => r.area.color || 'var(--tx3)';

  return `<div class="card">
    <div class="dim" style="margin-bottom:8px">${st.days} ngày qua bạn dồn sức vào đâu — tính theo việc đã xong,
      thẻ giao việc động tới và nhật ký gặp gỡ.</div>
    <div class="balbar">${st.total
      ? active.filter(r => r.pct).map(r => `<span style="width:${r.pct}%;background:${col(r)}"></span>`).join('')
      : `<span style="width:100%;background:var(--bg4)"></span>`}</div>
    ${active.map(r => `<div class="balrow">
      <span class="sw" style="background:${col(r)}"></span>
      <div class="grow">
        <div class="nm ell">${esc(r.area.name)}</div>
        <div class="dim">${r.touch} lượt chạm · ${r.open} việc đang mở${r.late?` · ${r.late} trễ`:''}</div>
        <div class="mini"><i style="width:${r.pct}%;background:${col(r)}"></i></div>
      </div>
      <div class="pc" style="${r.touch===0&&r.open?'color:var(--bad)':''}">${r.pct}%</div>
    </div>`).join('')}
    ${active.filter(r => r.open && !r.touch).map(r =>
      `<div class="chip bad" style="margin-top:10px">⚠︎ ${esc(r.area.name)}: ${r.open} việc đang mở mà ${st.days} ngày qua chưa đụng tới</div>`
    ).join(' ')}
  </div>`;
}

/* ---------------- SỔ TIỀN ---------------- */
function vMoney(){
  const ym = S.moneyMonth;
  const [Y, M] = ym.split('-').map(Number);
  const f  = monthFlow(ym);
  const pv = monthFlow(prevMonth(ym));
  const ly = monthFlow(shiftMonth(ym, -12));      // cùng kỳ năm ngoái

  /* 12 tháng gần nhất để vẽ cột */
  const bars = [];
  for (let i = 11; i >= 0; i--){
    const m = shiftMonth(ym, -i);
    const t = monthFlow(m);
    bars.push({m, out:t.totalOut, rel:t.outRelation, staff:t.outStaff});
  }
  const peak = Math.max(1, ...bars.map(b => b.out));
  const delta = pv.totalOut ? Math.round((f.totalOut - pv.totalOut) / pv.totalOut * 100) : null;

  let h = `<div class="calhd">
    <button class="iconbtn" data-act="moneyNav" data-id="-1">‹</button>
    <div class="mth">Tháng ${M}/${Y}</div>
    <button class="iconbtn" data-act="moneyNav" data-id="1">›</button>
    <button class="btn sm" data-act="moneyNow">Tháng này</button>
  </div>`;

  h += `<div class="stats">
    <div class="stat"><div class="v" style="${f.totalOut?'color:var(--bad)':''}">${moneyShort(f.totalOut)}</div>
      <div class="l">Tổng chi</div></div>
    <div class="stat"><div class="v">${moneyShort(f.outRelation)}</div><div class="l">Quan hệ</div></div>
    <div class="stat"><div class="v">${moneyShort(f.outStaff)}</div><div class="l">Nhân viên</div></div>
    <div class="stat"><div class="v" style="${delta===null?'':delta>0?'color:var(--bad)':'color:var(--ok)'}">${
      delta === null ? '—' : (delta > 0 ? '+' : '') + delta + '%'}</div>
      <div class="l">So tháng trước</div></div>
  </div>`;

  /* biểu đồ 12 tháng */
  h += secHd('12 tháng gần nhất');
  h += `<div class="card">
    <div class="mchart">${bars.map(b => {
      const hh = Math.round(b.out / peak * 100);
      const relH = b.out ? Math.round(b.rel / b.out * hh) : 0;
      return `<div class="mcol ${b.m === ym ? 'on' : ''}" data-act="moneyGo" data-id="${b.m}"
          title="${fmtDate(b.m + '-01').slice(3)} · ${money(b.out)}">
        <div class="mval">${b.out ? moneyShort(b.out) : ''}</div>
        <div class="mbar" style="height:${Math.max(b.out?4:1, hh)}%">
          <i style="height:${relH}%"></i>
        </div>
        <div class="mlbl">${+b.m.slice(5)}</div>
      </div>`;
    }).join('')}</div>
    <div class="row" style="gap:14px;margin-top:10px;justify-content:center">
      <span class="chip"><span class="sw" style="background:var(--acc2)"></span>Quan hệ</span>
      <span class="chip"><span class="sw" style="background:var(--acc)"></span>Nhân viên</span>
    </div>
  </div>`;

  /* so cùng kỳ năm ngoái — hữu ích nhất trước Tết */
  if (ly.totalOut){
    const d = Math.round((f.totalOut - ly.totalOut) / ly.totalOut * 100);
    h += `<div class="card" style="margin-top:10px">
      <div class="row"><div class="grow">
        <div style="font-weight:650">Cùng kỳ năm ngoái: ${money(ly.totalOut)}</div>
        <div class="dim">Tháng ${M}/${Y - 1} · quan hệ ${moneyShort(ly.outRelation)} · nhân viên ${moneyShort(ly.outStaff)}</div>
      </div><span class="chip ${d > 0 ? 'bad' : 'ok'}">${d > 0 ? '+' : ''}${d}%</span></div></div>`;
  }

  /* chi tiết */
  if (!f.out.length && !f.inc.length)
    return h + `<div class="empty" style="margin-top:20px">Tháng này chưa ghi khoản nào.</div>`;

  if (f.out.length){
    h += secHd('Đã chi (' + f.out.length + ' khoản)');
    h += f.out.map(x => `<div class="item" ${x.personId ? `data-act="person" data-id="${x.personId}"`
        : x.cardId ? `data-act="card" data-id="${x.cardId}"` : ''}>
      <span class="sw" style="width:10px;height:10px;border-radius:3px;flex:none;
        background:${x.group === 'quan hệ' ? 'var(--acc2)' : 'var(--acc)'}"></span>
      <div class="grow"><div class="t ell">${esc(x.title)}</div>
        <div class="s">${esc(x.who)} · ${fmtDate(x.date)}${x.occasion ? ' · ' + esc(x.occasion) : ''}</div></div>
      <span class="chip">${moneyShort(x.amount)}</span></div>`).join('');
  }

  /* gom theo dịp trong cả năm — để đặt ngân sách cho lần sau */
  const yFrom = Y + '-01-01', yTo = Y + '-12-31';
  const yFlow = cashFlow(yFrom, yTo);
  const byOcc = {};
  yFlow.out.forEach(x => { if (x.occasion) (byOcc[x.occasion] = byOcc[x.occasion] || []).push(x); });
  const occKeys = Object.keys(byOcc).sort((a,b) =>
    byOcc[b].reduce((s,x) => s + x.amount, 0) - byOcc[a].reduce((s,x) => s + x.amount, 0));
  if (occKeys.length){
    h += secHd('Chi theo dịp trong năm ' + Y);
    h += `<div class="card">${occKeys.map(k => {
      const list = byOcc[k], tot = list.reduce((s,x) => s + x.amount, 0);
      return `<div class="row" style="padding:8px 0;border-top:1px solid var(--line)">
        <div class="grow"><div style="font-weight:600;font-size:14px">${esc(k)}</div>
          <div class="dim">${list.length} người · trung bình ${moneyShort(Math.round(tot/list.length))}</div></div>
        <span class="chip">${moneyShort(tot)}</span></div>`;
    }).join('')}
    <div class="dim" style="margin-top:10px">Dùng con số này để đặt ngân sách cho dịp tương tự năm sau.</div></div>`;
  }

  if (f.inc.length){
    h += secHd('Đã nhận (' + f.inc.length + ' khoản)');
    h += `<div class="dim" style="margin:-4px 2px 10px">Quà và ân tình người khác trao mình — không phải tiền mặt,
      chỉ để đối chiếu xem mình đang nợ hay dư.</div>`;
    h += f.inc.map(x => `<div class="item" data-act="person" data-id="${x.personId}">
      <span class="sw" style="width:10px;height:10px;border-radius:3px;flex:none;background:var(--ok)"></span>
      <div class="grow"><div class="t ell">${esc(x.title)}</div>
        <div class="s">${esc(x.who)} · ${fmtDate(x.date)}${x.occasion ? ' · ' + esc(x.occasion) : ''}</div></div>
      <span class="chip ok">${moneyShort(x.amount)}</span></div>`).join('');
  }
  return h;
}

/* ---------------- HỒ SƠ NHÂN VIÊN ---------------- */
function vStaff(){
  const s = staff().find(x => x.id === S.staffId);
  if (!s){ S.view = 'board'; return vBoard(); }
  const st = staffStats(s.name);
  const areaNames = (s.areaIds || []).map(i => areaOf(i)).filter(Boolean);

  const stat = (v, l, color) => `<div class="stat"><div class="v" style="${color?'color:'+color:''}">${v}</div>
    <div class="l">${l}</div></div>`;

  let h = `<div class="card">
    <div class="row" style="align-items:flex-start">
      <div class="av lg" style="background:var(--acc);color:#fff">${esc(initials(s.name))}</div>
      <div class="grow" style="padding-top:2px">
        <div style="font-size:19px;font-weight:700;letter-spacing:-.3px">${esc(s.name)}</div>
        <div class="row" style="gap:6px;margin-top:7px;flex-wrap:wrap">
          <span class="chip acc">${esc(s.role || 'chưa ghi vai trò')}</span>
          ${areaNames.map(a => `<span class="chip"><span class="sw" style="background:${esc(a.color)}"></span>${esc(a.name)}</span>`).join('')}
          ${s.birthday ? (() => { const bd = nextBirthday(s.birthday);
            return `<span class="chip ${bd !== null && bd <= 14 ? 'warn' : ''}">🎂 ${fmtDate(s.birthday)}${
              bd === 0 ? ' · hôm nay!' : bd !== null && bd <= 45 ? ` · còn ${bd}n` : ''}</span>`; })() : ''}
          ${s.startDate ? `<span class="chip">vào làm ${fmtDate(s.startDate)}</span>` : ''}
        </div>
      </div>
    </div>
    ${s.note ? `<div class="muted" style="margin-top:12px;font-size:13.5px">${nl(s.note)}</div>` : ''}
    <div class="btns" style="margin-top:14px">
      ${s.phone ? `<a class="btn sm" href="tel:${esc(s.phone)}">📞 Gọi</a>` : ''}
      <button class="btn sm" data-act="editStaff" data-id="${s.id}">Sửa hồ sơ</button>
      <button class="btn sm" data-act="asg" data-id="${esc(s.name)}">Xem trên bảng</button>
      <button class="btn sm" data-act="addCardFor" data-id="${esc(s.name)}">+ Giao việc</button>
      <button class="btn sm" data-act="staffLink" data-id="${s.id}">🔗 Link</button>
    </div>
  </div>`;

  h += `<div class="stats" style="margin-top:12px">
    ${stat(st.total, 'Tổng việc')}
    ${stat(st.activeN, 'Đang làm')}
    ${stat(st.doneN, 'Đã xong', 'var(--ok)')}
    ${stat(st.lateN, 'Đang trễ', st.lateN ? 'var(--bad)' : '')}
  </div>`;

  h += `<div class="card" style="margin-top:10px">
    <div class="row"><div class="grow">
      <div style="font-weight:650">Tỉ lệ hoàn thành ${st.pct}%</div>
      <div class="dim">${st.onTimePct !== null
        ? `${st.onTimePct}% xong đúng hạn (tính trên ${st.judgedN} việc có ghi hạn)`
        : 'Chưa đủ dữ liệu để chấm đúng hạn — cần thẻ có hạn chót và được đánh dấu hoàn thành trong app'}</div>
    </div><span class="chip ${st.pct===100&&st.total?'ok':st.lateN?'bad':''}">${st.pct}%</span></div>
    <div class="pg"><i style="width:${st.pct}%"></i></div>
  </div>`;

  /* tiền ngoài luồng */
  if (st.exCount){
    h += secHd('Tiền ngoài luồng');
    h += `<div class="card" style="margin-bottom:10px">
      <div class="row">
        <div style="flex:1;text-align:center">
          <div style="font-size:17px;font-weight:700;color:${st.owed?'var(--warn)':'var(--tx2)'}">${money(st.owed)}</div>
          <div class="dim">chưa trả</div></div>
        <div style="flex:1;text-align:center">
          <div style="font-size:17px;font-weight:700;color:var(--ok)">${money(st.paid)}</div>
          <div class="dim">đã trả</div></div>
      </div>
      ${st.owed ? `<button class="btn sm full" style="margin-top:12px" data-act="payAllExtra" data-who="${esc(s.name)}">Đánh dấu đã trả hết</button>` : ''}
    </div>`;
    h += st.ex.sort((a,b) => (a.extraPaidDate?1:0) - (b.extraPaidDate?1:0)).map(c => `
      <div class="item">
        <div class="cb ${c.extraPaidDate?'on':''}" data-act="payExtra" data-id="${c.id}">✓</div>
        <div class="grow" data-act="card" data-id="${c.id}">
          <div class="t ell" style="${c.extraPaidDate?'opacity:.6':''}">${esc(c.title)}</div>
          <div class="s">${c.extraPaidDate ? 'đã trả ' + fmtDate(c.extraPaidDate) : 'chưa trả'}</div>
        </div>
        <span class="chip ${c.extraPaidDate?'ok':'warn'}">${moneyShort(c.extraPay)}</span>
      </div>`).join('');
  }

  /* việc theo cột */
  const groups = COLS.map(col => ({col, list:st.cards.filter(c => c.col === col.id)})).filter(g => g.list.length);
  if (groups.length){
    h += secHd('Việc đang phụ trách');
    h += groups.map(g => `
      <div class="card" style="margin-bottom:10px;padding:12px">
        <div class="row" style="margin-bottom:4px">
          <div class="grow" style="font-weight:650;font-size:14px">${esc(g.col.label)}</div>
          <span class="chip">${g.list.length}</span>
        </div>
        ${g.list.map(c => {
          const late = c.col !== 'done' && c.due && dayDiff(c.due) < 0;
          return `<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"
              data-act="card" data-id="${c.id}">
            ${areaDot(c.areaId)}
            <div class="grow"><div class="ell" style="font-size:14px;font-weight:600">${esc(c.title)}</div>
              <div class="dim">${c.col === 'done'
                ? (c.doneAt ? 'xong ' + fmtDate(c.doneAt) + (c.due && c.doneAt > c.due ? ' · trễ hạn' : '') : 'đã xong')
                : c.due ? dueText(c.due) : 'không hạn'}${c.extra ? ' · ngoài luồng' : ''}</div></div>
            ${late ? `<span class="chip bad">trễ</span>` : ''}
            ${c.progress ? `<span class="chip">${c.progress}%</span>` : ''}
          </div>`;
        }).join('')}
      </div>`).join('');
  } else {
    h += `<div class="empty">Chưa có thẻ việc nào giao cho ${esc(s.name)}.</div>`;
  }
  return h;
}

/* ---------------- ÔN LẠI TUẦN ---------------- */
function vReview(){
  const from = addDays(today(), -7);
  /* việc lặp lại không bao giờ ở trạng thái "done", nên đếm theo lịch sử hoàn thành */
  const doneW = [];
  tasks().forEach(t => {
    if (t.repeat) (t.doneLog||[]).forEach(d => { if (d >= from) doneW.push({title:t.title, doneAt:d}); });
    else if (t.done && t.doneAt && t.doneAt >= from) doneW.push({title:t.title, doneAt:t.doneAt});
  });
  doneW.sort((a,b) => b.doneAt.localeCompare(a.doneAt));
  const lateW  = tasks().filter(t => !t.done && t.due && dayDiff(t.due) < 0);
  /* Chấm theo mốc hoàn thành, không theo updatedAt — sửa lại một thẻ cũ
     không có nghĩa là tuần này mới làm xong nó. */
  const cardsW = cards().filter(c => c.col === 'done' && (c.doneAt || '') >= from);
  const touched = people().filter(p => p.lastContact && p.lastContact >= from);
  const forgotten = staleP().slice(0,8);
  const debts = people().map(p => ({p, b:balance(p.id)})).filter(x => x.b.open > 0);

  let h = `<div class="card" style="margin-bottom:12px">
    <div style="font-weight:700;font-size:16px;margin-bottom:4px">Tuần ${fmtDate(from)} → ${fmtDate(today())}</div>
    <div class="dim">Mười phút mỗi Chủ nhật. Nhìn lại rồi chốt việc cho tuần tới.</div>
  </div>
  <div class="stats" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat"><div class="v" style="color:var(--ok)">${doneW.length}</div><div class="l">Việc xong</div></div>
    <div class="stat"><div class="v" style="color:var(--acc)">${cardsW.length}</div><div class="l">Thẻ giao xong</div></div>
    <div class="stat"><div class="v" style="color:${lateW.length?'var(--bad)':'var(--tx)'}">${lateW.length}</div><div class="l">Việc trễ</div></div>
    <div class="stat"><div class="v">${touched.length}</div><div class="l">Người đã hỏi thăm</div></div>
  </div>`;

  const xt = extraTotals();
  if (xt.owed){
    h += secHd('Tiền công ngoài luồng chưa trả');
    h += `<div class="card" style="padding:12px" data-act="nav" data-id="board">
      <div class="row"><div class="grow">
        <div style="font-weight:650;font-size:15px;color:var(--warn)">${money(xt.owed)}</div>
        <div class="dim">${xt.unpaid} việc ngoài luồng đã giao mà chưa chi trả</div>
      </div><span class="chip">Mở bảng giao việc</span></div></div>`;
  }

  const bal = balanceBlock(7);
  if (bal){ h += secHd('Cân bằng giữa các mảng'); h += bal; }

  if (doneW.length){
    h += secHd('Đã hoàn thành');
    h += `<div class="card">${doneW.slice(0,20).map(t =>
      `<div class="row dim" style="padding:4px 0"><span style="color:var(--ok)">✓</span>
       <span class="grow ell" style="color:var(--tx2)">${esc(t.title)}</span><span>${fmtDate(t.doneAt)}</span></div>`).join('')}</div>`;
  }
  if (lateW.length){
    h += secHd('Đang trễ — dời hay bỏ?');
    h += lateW.slice(0,10).map(taskItem).join('');
  }
  if (forgotten.length){
    h += secHd('Đang bị bỏ quên');
    h += `<div class="pgrid">${forgotten.map(x => personCard(x.p)).join('')}</div>`;
  }
  if (debts.length){
    h += secHd('Còn nợ ân tình');
    h += debts.map(x => `<div class="item" data-act="person" data-id="${x.p.id}">
      ${avatar(x.p)}<div class="grow"><div class="t ell">${esc(x.p.name)}</div>
      <div class="s">${x.b.open} món chưa trả lại</div></div>
      <span class="chip bad">${moneyShort(x.b.diff)}</span></div>`).join('');
  }
  h += secHd('Ba câu tự vấn');
  h += `<div class="card muted" style="font-size:14px;line-height:1.9">
    1. Việc nào tuần này tạo ra kết quả thật, việc nào chỉ làm cho bận?<br>
    2. Ai đã giúp mình mà mình chưa cảm ơn tử tế?<br>
    3. Tuần tới, ba việc nào nếu xong thì coi như tuần đó thành công?
  </div>`;
  return h;
}

/* ---------------- THÔNG BÁO TELEGRAM + NHẮC LẶP LẠI ---------------- */
/* Bảy ngày gần nhất, cũ → mới. Bấm "Xong" trên Telegram mà không thấy gì
   đổi trong app thì chẳng ai tin là nó có ghi lại — dải này là bằng chứng. */
function remDots(r){
  const days = (r.days || []).map(Number);
  const log = new Set((r.doneLog || []).map(String));
  const t0 = today();
  let out = '';
  for (let i = 6; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    const iso = ymd(d);
    if (!days.includes(d.getDay()))  out += `<span style="opacity:.25">·</span>`;
    else if (log.has(iso))           out += `<span style="color:var(--ok)">●</span>`;
    else if (iso === t0)             out += `<span style="opacity:.55">◌</span>`;
    else                             out += `<span style="color:var(--bad);opacity:.7">○</span>`;
  }
  return `<span title="7 ngày gần nhất" style="letter-spacing:2px">${out}</span>`;
}

function remItem(r){
  const next = reminderNextText(r);
  const xong = remDoneToday(r);
  const chuoi = remStreak(r);
  return `<div class="rem ${r.enabled ? '' : 'off'}">
    <div class="cb ${r.enabled?'on':''}" data-act="toggleRem" data-id="${r.id}">✓</div>
    <div class="tm">${esc(r.time)}</div>
    <div class="grow" data-act="editRem" data-id="${r.id}">
      <div class="nm ell">${esc(r.title)}</div>
      <div class="dim">${esc(daysText(r.days))}${r.topic ? ' · nhánh ' + esc(r.topic) : ''} · ${esc(next)}${
        chuoi > 1 ? ` · <span class="streak">🔥 ${chuoi}</span>` : ''}</div>
      <div class="dim" style="margin-top:2px">${remDots(r)}</div>
    </div>
    <button class="iconbtn" data-act="remDone" data-id="${r.id}" title="${xong?'Bỏ đánh dấu hôm nay':'Xong hôm nay'}"
      style="${xong?'color:var(--ok)':''}">✓</button>
    <button class="iconbtn" data-act="remNow" data-id="${r.id}" title="Gửi thử ngay">➤</button>
  </div>`;
}

function tgBlock(){
  const t = TG || {};
  const list = reminders().slice().sort((a,b) =>
    (b.enabled?1:0) - (a.enabled?1:0) || (a.time||'').localeCompare(b.time||''));
  const live = t.enabled && t.hasToken && t.chatId;

  let h = secHd('Thông báo Telegram');
  h += `<div class="card">
    <div class="row" style="margin-bottom:10px">
      <span class="dot ${live ? 'ok' : ''}"></span>
      <div class="grow dim">${!t.hasToken ? 'Chưa cài — app chỉ nhắc trong máy'
        : !t.chatId ? 'Có mã bot nhưng chưa chọn group'
        : !t.enabled ? 'Đã cài nhưng đang tắt'
        : 'Đang bật · group ' + esc(String(t.chatId)) + (t.topic ? ' · nhánh ' + esc(String(t.topic)) : '')}</div>
      <button class="btn sm ${live ? '' : 'pri'}" data-act="tgBox">${t.hasToken ? 'Sửa' : 'Cài đặt'}</button>
    </div>
    <div class="dim" style="line-height:1.65">
      Khác với thông báo trong máy: cái này do <b>máy chủ</b> gửi nên vẫn tới kể cả khi
      bạn tắt hẳn app và tắt trình duyệt.
      ${t.digestHour != null && t.digestHour >= 0
        ? `Bản tóm tắt hằng ngày gửi lúc <b>${String(t.digestHour).padStart(2,'0')}:00</b>.`
        : 'Bản tóm tắt hằng ngày đang tắt.'}
      ${t.workHour != null && t.workHour >= 0
        ? ` Bảng công việc gửi lúc <b>${String(t.workHour).padStart(2,'0')}:00</b>.`
        : ' Bảng công việc đang tắt.'}
      ${t.weeklyHour != null && t.weeklyHour >= 0
        ? ` Tóm tắt tuần gửi Chủ nhật lúc <b>${String(t.weeklyHour).padStart(2,'0')}:00</b>.`
        : ' Tóm tắt tuần đang tắt.'}
      ${t.escalate ? ' Báo trễ leo thang đang <b>bật</b> — trễ 3/7/14/30 ngày sẽ có tin riêng.' : ''}
      ${t.staffWeekly ? ' Tổng kết theo nhân sự đang <b>bật</b> — mỗi người một tin, gửi cùng giờ tóm tắt tuần.' : ''}
    </div>
    ${live ? `<div class="dim" style="margin-top:12px;line-height:1.8">
      <b>Nhánh trong group</b> — mỗi loại tin một chỗ, khỏi lẫn:<br>
      ${[['Việc cần làm', t.taskTopic], ['Giao việc', t.cardTopic],
         ['Nhắc lặp lại', t.remTopic], ['Báo cáo', t.reportTopic]]
        .map(([lbl, v]) => `· ${lbl}: ` + (v ? `nhánh <b>${esc(String(v))}</b>`
          : `<span class="dim">nhánh mặc định</span>`)).join('<br>')}
    </div>` : ''}
    ${live ? `<div class="btns" style="margin-top:12px;flex-wrap:wrap">
      <button class="btn sm grow" data-act="workNow">Gửi bảng công việc ngay</button>
      <button class="btn sm grow" data-act="weeklyNow">Gửi tóm tắt tuần ngay</button>
      <button class="btn sm grow" data-act="staffNow">Gửi tổng kết nhân sự ngay</button>
      <button class="btn sm grow" data-act="tgWhy">Vì sao chưa gửi?</button>
    </div>` : ''}
    ${live ? `<div class="dim" style="margin-top:12px;line-height:1.65">
      <b>Nút bấm dưới tin nhắc:</b> "✅ Xong" đánh dấu việc xong, còn
      "⏰ 4 giờ / 12 giờ / 1 ngày / 3 ngày" dời lời nhắc lại — cả hai đều
      hiện ngay trên web sau lượt đồng bộ, không cần mở app để bấm.
      Lời nhắc lặp lại có nút "✅ Xong hôm nay" để giữ chuỗi 🔥.
      ${t.webhookOn ? 'Đang <b>bật</b>.' : 'Đang tắt — cần tên miền chạy https.'}
      </div>
      ${t.webhookOn ? `<div class="dim" style="margin-top:10px;line-height:1.65">
        <b>Ghi nhanh từ Telegram:</b> nhắn <span class="mono" style="display:inline">/ghi mua thêm dầu gội</span>
        vào group là có ngay một mẩu trong Hộp ghi nhanh. Gõ dấu <b>/</b> là Telegram
        hiện sẵn danh sách lệnh. Muốn gõ gọn hơn bằng dấu <b>+</b> thì vào
        BotFather → <b>/setprivacy</b> → <b>Disable</b> cho bot này.
      </div>
      <div class="btns" style="margin-top:8px">
        <button class="btn sm grow" data-act="tgHook">Nhắn /ghi mà không thấy gì?</button>
      </div>` : ''}
      <div class="btns" style="margin-top:8px">
        ${t.webhookOn
          ? `<button class="btn sm grow dngr" data-act="webhookOff">Tắt nút bấm</button>`
          : `<button class="btn sm grow" data-act="webhookOn">Bật nút bấm</button>`}
      </div>` : ''}
    ${t.cron ? `<div class="dim" style="margin-top:12px;line-height:1.6">
      <b>Bước cuối — hẹn giờ cho máy chủ.</b> Vào hPanel → Cron Jobs, tạo lịch chạy
      <b>mỗi 5 phút</b> với lệnh:
      <div class="mono">${esc(t.cron)}</div>
      Nếu gói hosting chỉ cho gọi bằng đường link thì dùng địa chỉ này thay cho lệnh trên:
      <div class="mono">${esc(t.cronUrl || '')}</div>
      Chưa làm bước này thì lời nhắc vẫn hiện trong app nhưng sẽ không có tin nào chạy vào Telegram.
    </div>` : ''}
  </div>`;

  h += secHd('Nhắc lặp lại (' + list.length + ')',
             `<button data-act="addRem">+ Thêm</button>`);
  h += list.length ? list.map(remItem).join('')
    : `<div class="empty" style="padding:22px">Chưa có lời nhắc nào.<br>
       Ví dụ: <b>Tập gym</b> · T2·T3·T5·T6·T7 · 18:30.</div>`;
  return h;
}

/* ---------------- CÀI ĐẶT ---------------- */
function vSettings(){
  const s = db.settings, st = Sync.status();
  const n = COLLECTIONS.reduce((a,k) => a + alive(db[k]).length, 0);
  return `
  ${secHd('Dữ liệu')}
  <div class="card">
    <div class="dim" style="margin-bottom:12px">${n} bản ghi · lưu trên thiết bị này</div>
    <div class="btns">
      <button class="btn sm" data-act="export">⬇︎ Xuất sao lưu</button>
      <button class="btn sm" data-act="import">⬆︎ Nhập sao lưu</button>
      <button class="btn sm" data-act="staffBox">👥 Nhân sự</button>
      <button class="btn sm" data-act="areaBox">🏷 Mảng việc</button>
      ${n===0 ? `<button class="btn sm" data-act="seed">✨ Dữ liệu mẫu</button>` : ''}
      <button class="btn sm dngr" data-act="wipe">Xoá sạch</button>
    </div>
  </div>

  ${secHd('Nhắc nhở')}
  <div class="card">
    <div class="row">
      <div class="grow"><div style="font-weight:600">Thông báo hằng ngày</div>
        <div class="dim">${Notify.supported()
          ? (Notify.granted() ? (s.notifyOn?'Đang bật':'Đã cấp quyền nhưng đang tắt') : 'Chưa cấp quyền')
          : 'Trình duyệt không hỗ trợ'}</div></div>
      <button class="btn sm ${s.notifyOn?'':'pri'}" data-act="toggleNotify">${s.notifyOn?'Tắt':'Bật'}</button>
    </div>
    <div class="f" style="margin-top:12px;margin-bottom:0"><label>Giờ nhắc mỗi ngày</label>
      <input type="number" min="0" max="23" id="set_hour" value="${s.notifyHour ?? 8}"></div>
    <div class="btns" style="margin-top:10px">
      <button class="btn sm" data-act="testNotify">Bắn thử</button>
      <button class="btn sm" data-act="saveHour">Lưu giờ</button>
    </div>
    <div class="dim" style="margin-top:10px;line-height:1.6">
      Đây là thông báo cục bộ: chỉ bắn khi app đang mở hoặc chạy nền. Trên iPhone cần
      “Thêm vào Màn hình chính” rồi mở app ít nhất một lần trong ngày.
    </div>
  </div>

  ${Server.available() ? tgBlock() : ''}

  ${Server.available() ? `
  ${secHd('Tài khoản & máy chủ')}
  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <span class="dot ${st.state==='error'?'bad':'ok'}"></span>
      <div class="grow dim">${st.state==='error' ? esc(st.lastError)
        : 'Đã đăng nhập · dữ liệu đồng bộ qua máy chủ của bạn'}</div>
    </div>
    <div class="dim" id="srvinfo" style="margin-bottom:12px">Bấm "Xem máy chủ" để lấy số liệu.</div>
    <div class="btns">
      <button class="btn sm" data-act="syncNow">Đồng bộ ngay</button>
      <button class="btn sm" data-act="srvStats">Xem máy chủ</button>
      <button class="btn sm" data-act="logout">Đăng xuất</button>
      <button class="btn sm dngr" data-act="logoutAll">Đăng xuất mọi thiết bị</button>
    </div>
    <div class="dim" style="margin-top:12px;line-height:1.6">
      Đổi mật khẩu: chạy <b>node tools/hash-password.js</b> ở máy, dán dòng nó in ra vào
      <b>api/config.php</b> rồi upload đè. Các máy đang đăng nhập vẫn giữ phiên —
      muốn đá hết ra thì bấm "Đăng xuất mọi thiết bị".
    </div>
  </div>` : ''}

  ${secHd(Server.available() ? 'Đồng bộ dự phòng qua Supabase' : 'Đồng bộ nhiều thiết bị (Supabase)')}
  <div class="card">
    ${Server.available() ? `<div class="dim" style="margin-bottom:12px;line-height:1.6">
      Bạn đang dùng máy chủ riêng nên phần này không cần thiết. Cứ để trống.</div>` : ''}
    <div class="row" style="margin-bottom:12px">
      <span class="dot ${!st.on?'':st.state==='error'?'bad':'ok'}"></span>
      <div class="grow dim">${st.mode === 'server' ? 'Đang dùng máy chủ riêng'
        : !st.on ? 'Đang tắt — dữ liệu chỉ nằm trên máy này'
        : st.state==='error' ? esc(st.lastError) : 'Đang bật · không gian "' + esc(st.workspace) + '"'}</div>
    </div>
    <div class="fgrid">
      <div class="f"><label>Supabase URL</label>
        <input id="set_url" placeholder="https://xxxx.supabase.co" value="${esc(s.supabaseUrl)}"></div>
      <div class="f"><label>Anon key</label>
        <input id="set_key" placeholder="eyJhbGciOi…" value="${esc(s.supabaseKey)}"></div>
      <div class="f half"><label>Tên không gian</label>
        <input id="set_ws" placeholder="nha-cua-toi" value="${esc(s.workspace)}"></div>
      <div class="f half"><label>Vai trò trên máy này</label>
        <select id="set_role">
          <option value="owner"${s.role==='owner'?' selected':''}>Chủ (thấy tất cả)</option>
          <option value="staff"${s.role==='staff'?' selected':''}>Nhân viên (chỉ thấy việc của mình)</option>
        </select></div>
      <div class="f"><label>Tên nhân viên (nếu chọn vai trò nhân viên)</label>
        <input id="set_staff" placeholder="Tên đúng như trên thẻ việc" value="${esc(s.staffName)}"></div>
    </div>
    <div class="btns">
      <button class="btn sm pri" data-act="saveSync">Lưu & kết nối</button>
      <button class="btn sm" data-act="syncNow">Đồng bộ ngay</button>
      <button class="btn sm" data-act="genWs">Tạo tên ngẫu nhiên</button>
    </div>
    <div class="dim" style="margin-top:12px;line-height:1.6">
      Cần chạy một lần file <b>supabase-schema.sql</b> trong SQL Editor của Supabase để tạo bảng.
      Ai biết tên không gian + anon key đều đọc ghi được dữ liệu đó, nên đặt tên khó đoán và
      chỉ đưa cho người bạn tin.
    </div>
  </div>`;
}
