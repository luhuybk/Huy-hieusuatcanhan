/* ============================================================
   voice.js — đọc thành chữ (tiếng Việt) cho các ô ghi chú
   Dùng Web Speech API sẵn có của trình duyệt, không gửi gì ra ngoài
   ngoài chính dịch vụ nhận dạng của trình duyệt.
   Chrome / Edge / Safari mới: chạy. Firefox: chưa hỗ trợ → nút tự ẩn.
   ============================================================ */
"use strict";

const Voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, active = false, target = null;

  const supported = () => !!SR;

  function stop(){
    if (rec){ try { rec.stop(); } catch(e){} }
    active = false; paint(false);
  }
  function paint(on){
    if (!target) return;
    const btn = document.querySelector(`[data-mic="${target.id}"]`);
    if (btn){ btn.classList.toggle('rec', on); btn.textContent = on ? '■' : '🎤'; }
  }

  /* Bật/tắt ghi âm, chữ nhận được nối vào textarea/input đang chỉ định */
  function toggle(el){
    if (!supported()){ toast('Trình duyệt này chưa hỗ trợ đọc thành chữ'); return; }
    if (active && target === el){ stop(); return; }
    if (active) stop();

    target = el;
    const base = el.value ? el.value.trim() + ' ' : '';
    rec = new SR();
    rec.lang = 'vi-VN';
    rec.continuous = true;
    rec.interimResults = true;

    let finalText = '';
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++){
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      el.value = (base + finalText + interim).replace(/\s+/g,' ');
      el.scrollTop = el.scrollHeight;
    };
    rec.onerror = e => {
      active = false; paint(false);
      toast(e.error === 'not-allowed' ? 'Chưa cấp quyền micro' : 'Lỗi ghi âm: ' + e.error);
    };
    rec.onend = () => { active = false; paint(false); };

    try { rec.start(); active = true; paint(true); toast('Đang nghe… bấm ■ để dừng'); }
    catch(e){ toast('Không mở được micro'); }
  }

  return {supported, toggle, stop, isActive:() => active};
})();
window.Voice = Voice;
