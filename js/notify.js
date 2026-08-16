/* ============================================================
   notify.js — nhắc nhở bằng thông báo hệ thống
   Giới hạn thật thà: đây là thông báo cục bộ, chỉ bắn được khi app
   đang mở hoặc đang chạy nền. Không có máy chủ đẩy nên nếu tắt hẳn
   app cả ngày thì sẽ không có thông báo — mở app ra là thấy ngay bản
   tóm tắt trong màn hình Tổng quan.
   ============================================================ */
"use strict";

const Notify = (() => {
  let timer = null;

  const supported = () => ('Notification' in window);
  const granted   = () => supported() && Notification.permission === 'granted';

  async function request(){
    if (!supported()) { toast('Trình duyệt này không hỗ trợ thông báo'); return false; }
    const p = await Notification.requestPermission();
    if (p === 'granted'){ db.settings.notifyOn = true; save(); start(); return true; }
    toast(p === 'denied' ? 'Bạn đã chặn thông báo cho trang này' : 'Chưa được cấp quyền');
    return false;
  }

  async function show(title, body, tag){
    if (!granted()) return;
    /* bản gộp một tệp không có thư mục assets/ nên bỏ icon cho khỏi hỏng */
    const opts = {body, tag, renotify:false};
    if (location.protocol.startsWith('http')){
      opts.icon  = 'assets/icon-192.png';
      opts.badge = 'assets/favicon-32.png';
    }
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) return reg.showNotification(title, opts);
    } catch(e){}
    try { new Notification(title, opts); } catch(e){}
  }

  /* ---- nội dung cần nhắc hôm nay ---- */
  function digest(){
    const lines = [];
    const due   = dueTasks();
    const late  = due.filter(t => dayDiff(t.due) < 0);
    const bdToday = allBirthdays(0);
    const bdSoon  = allBirthdays(3).filter(x => x.d > 0);
    const lc    = lateCards();
    const st    = staleP();

    const occ = dueOccasions();

    if (due.length)     lines.push(`✓ ${due.length} việc đến hạn${late.length ? ` (${late.length} đã trễ)` : ''}`);
    if (occ.length)     lines.push(...occ.slice(0,3).map(x =>
                          `🎊 ${x.o.title}: ${x.d === 0 ? 'hôm nay' : 'còn ' + x.d + ' ngày'}`));
    const bdName = x => x.name + (x.kind === 'staff' ? ' (nhân viên)' : '');
    if (bdToday.length) lines.push(`🎂 Hôm nay sinh nhật ${bdToday.map(bdName).join(', ')}`);
    if (bdSoon.length)  lines.push(`🎁 Sắp sinh nhật: ${bdSoon.map(bdName).join(', ')}`);
    if (lc.length)      lines.push(`⚠︎ ${lc.length} việc đã giao đang trễ`);
    if (st.length)      lines.push(`◍ ${st.length} người lâu rồi bạn chưa hỏi thăm`);
    return lines;
  }

  function check(){
    if (!granted() || !db.settings.notifyOn) return;
    const d = new Date();
    if (d.getHours() < (db.settings.notifyHour ?? 8)) return;
    const key = 'digest:' + today();
    if (db.meta.notified[key]) return;
    const lines = digest();
    if (!lines.length) return;
    db.meta.notified[key] = now();
    // dọn các mốc cũ hơn 30 ngày
    Object.keys(db.meta.notified).forEach(k => {
      const dt = k.split(':')[1];
      if (dt && dayDiff(dt) < -30) delete db.meta.notified[k];
    });
    save();
    show('Life Hub · ' + fmtDate(today()), lines.join('\n'), 'digest');
  }

  function start(){
    clearInterval(timer);
    if (!db.settings.notifyOn || !granted()) return;
    check();
    timer = setInterval(check, 60000);
  }

  function testFire(){
    if (!granted()) return request().then(ok => ok && testFire());
    const lines = digest();
    show('Life Hub · thử thông báo', lines.length ? lines.join('\n') : 'Hôm nay không có gì cần nhắc 🎉', 'test');
    toast('Đã bắn thử thông báo');
  }

  return {request, start, check, digest, testFire, granted, supported};
})();
window.Notify = Notify;
