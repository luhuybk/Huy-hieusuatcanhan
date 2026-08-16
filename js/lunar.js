/* ============================================================
   lunar.js — đổi dương lịch ⇄ âm lịch Việt Nam
   Thuật toán của Hồ Ngọc Đức (múi giờ +7), dùng cho giỗ, Tết,
   rằm và các ngày lễ tính theo âm lịch.
   ============================================================ */
"use strict";

const LUNAR_TZ = 7;

function jdFromDate(dd, mm, yy){
  const a = Math.floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153*m + 2)/5) + 365*y + Math.floor(y/4) - Math.floor(y/100) + Math.floor(y/400) - 32045;
  if (jd < 2299161) jd = dd + Math.floor((153*m + 2)/5) + 365*y + Math.floor(y/4) - 32083;
  return jd;
}
function jdToDate(jd){
  let a, b, c, d, e, m;
  if (jd > 2299160){
    a = jd + 32044; b = Math.floor((4*a + 3)/146097); c = a - Math.floor(b*146097/4);
  } else { b = 0; c = jd + 32082; }
  d = Math.floor((4*c + 3)/1461);
  e = c - Math.floor(1461*d/4);
  m = Math.floor((5*e + 2)/153);
  const day   = e - Math.floor((153*m + 2)/5) + 1;
  const month = m + 3 - 12*Math.floor(m/10);
  const year  = b*100 + d - 4800 + Math.floor(m/10);
  return [day, month, year];
}
function newMoon(k){
  const T = k/1236.85, T2 = T*T, T3 = T2*T, dr = Math.PI/180;
  let jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
  jd1 += 0.00033*Math.sin((166.56 + 132.87*T - 0.009173*T2)*dr);
  const M   = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
  const Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
  const F   = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
  let C1 = (0.1734 - 0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
  C1 -= 0.4068*Math.sin(Mpr*dr);          C1 += 0.0161*Math.sin(dr*2*Mpr);
  C1 -= 0.0004*Math.sin(dr*3*Mpr);        C1 += 0.0104*Math.sin(dr*2*F);
  C1 -= 0.0051*Math.sin(dr*(M + Mpr));    C1 -= 0.0074*Math.sin(dr*(M - Mpr));
  C1 += 0.0004*Math.sin(dr*(2*F + M));    C1 -= 0.0004*Math.sin(dr*(2*F - M));
  C1 -= 0.0006*Math.sin(dr*(2*F + Mpr));  C1 += 0.0010*Math.sin(dr*(2*F - Mpr));
  C1 += 0.0005*Math.sin(dr*(2*Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3
    : -0.000278 + 0.000265*T + 0.000262*T2;
  return jd1 + C1 - deltat;
}
function sunLongitude(jdn){
  const T = (jdn - 2451545.0)/36525, T2 = T*T, dr = Math.PI/180;
  const M  = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
  const L0 = 280.46645 + 36000.76983*T + 0.0003032*T2;
  let DL = (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M);
  DL += (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
  let L = (L0 + DL)*dr;
  return L - Math.PI*2*Math.floor(L/(Math.PI*2));
}
const getSunLongitude = (dayNumber, tz) => Math.floor(sunLongitude(dayNumber - 0.5 - tz/24)/Math.PI*6);
const getNewMoonDay   = (k, tz) => Math.floor(newMoon(k) + 0.5 + tz/24);

function getLunarMonth11(yy, tz){
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off/29.530588853);
  let nm = getNewMoonDay(k, tz);
  if (getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k - 1, tz);
  return nm;
}
function getLeapMonthOffset(a11, tz){
  const k = Math.floor((a11 - 2415021.076998695)/29.530588853 + 0.5);
  let last = 0, i = 1, arc = getSunLongitude(getNewMoonDay(k + i, tz), tz);
  do { last = arc; i++; arc = getSunLongitude(getNewMoonDay(k + i, tz), tz); }
  while (arc !== last && i < 14);
  return i - 1;
}
function solar2lunar(dd, mm, yy, tz){
  tz = tz == null ? LUNAR_TZ : tz;
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = Math.floor((dayNumber - 2415021.076998695)/29.530588853);
  let monthStart = getNewMoonDay(k + 1, tz);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz), b11 = a11, lunarYear;
  if (a11 >= monthStart){ lunarYear = yy;     a11 = getLunarMonth11(yy - 1, tz); }
  else                  { lunarYear = yy + 1; b11 = getLunarMonth11(yy + 1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11)/29);
  let lunarLeap = 0, lunarMonth = diff + 11;
  if (b11 - a11 > 365){
    const leapOff = getLeapMonthOffset(a11, tz);
    if (diff >= leapOff){ lunarMonth = diff + 10; if (diff === leapOff) lunarLeap = 1; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}
function lunar2solar(lunarDay, lunarMonth, lunarYear, lunarLeap, tz){
  tz = tz == null ? LUNAR_TZ : tz;
  let a11, b11;
  if (lunarMonth < 11){ a11 = getLunarMonth11(lunarYear - 1, tz); b11 = getLunarMonth11(lunarYear, tz); }
  else                { a11 = getLunarMonth11(lunarYear, tz);     b11 = getLunarMonth11(lunarYear + 1, tz); }
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365){
    const leapOff = getLeapMonthOffset(a11, tz);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) return [0,0,0];
    if (lunarLeap || off >= leapOff) off += 1;
  }
  const k = Math.floor(0.5 + (a11 - 2415021.076998695)/29.530588853);
  return jdToDate(getNewMoonDay(k + off, tz) + lunarDay - 1);
}

/* ---- tiện ích cho app ---- */
const pad2 = n => String(n).padStart(2,'0');

/* ngày âm hôm nay, dạng "15/7 âm" */
function lunarLabelOf(iso){
  const p = String(iso).slice(0,10).split('-').map(Number);
  const [d, m, y, leap] = solar2lunar(p[2], p[1], p[0]);
  return `${d}/${m}${leap ? ' nhuận' : ''} âm`;
}
/* lần xuất hiện dương lịch kế tiếp của một ngày âm (ngày/tháng âm) */
function nextLunarDate(lday, lmonth){
  const t = today().split('-').map(Number);
  const ly = solar2lunar(t[2], t[1], t[0])[2];
  for (let y = ly; y <= ly + 2; y++){
    const [dd, mm, yy] = lunar2solar(lday, lmonth, y, 0);
    if (!dd) continue;
    const iso = `${yy}-${pad2(mm)}-${pad2(dd)}`;
    if (dayDiff(iso) >= 0) return iso;
  }
  return null;
}
/* lần xuất hiện dương lịch kế tiếp của một ngày dương (ngày/tháng) */
function nextSolarDate(day, month){
  const y = new Date().getFullYear();
  for (let i = 0; i < 3; i++){
    const iso = `${y + i}-${pad2(month)}-${pad2(day)}`;
    if (dayDiff(iso) >= 0) return iso;
  }
  return null;
}
