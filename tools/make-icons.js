/* Sinh icon PNG từ cùng hình vẽ của icon.svg.
   Không dùng thư viện ngoài — tự mã hoá PNG bằng zlib có sẵn của Node.
   Chạy:  node tools/make-icons.js      → ghi vào thư mục assets/
   Cần PNG vì: iOS chỉ nhận apple-touch-icon dạng PNG, và thông báo
   hệ thống (notify.js) cũng không hiển thị được icon SVG.            */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');

/* ---- hình học, toạ độ theo khung 192x192 giống icon.svg ---- */
const BOX = 192, R = 42;                       // bo góc
const HEAD = {cx:96, cy:72, r:22};
/* vòm vai: hai đường cong bậc ba của path trong icon.svg */
const DOME = [
  [[52,138],[52,114],[72,100],[96,100]],
  [[96,100],[120,100],[140,114],[140,138]]
];

function bez(p, t){
  const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return [a*p[0][0] + b*p[1][0] + c*p[2][0] + d*p[3][0],
          a*p[0][1] + b*p[1][1] + c*p[2][1] + d*p[3][1]];
}
/* làm phẳng vòm thành đa giác để kiểm tra điểm nằm trong */
const domePoly = (() => {
  const pts = [];
  DOME.forEach(seg => { for (let i = 0; i <= 40; i++) pts.push(bez(seg, i/40)); });
  pts.push([140,138], [52,138]);
  return pts;
})();

function inPoly(x, y, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi,yi] = poly[i], [xj,yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRounded(x, y){
  if (x < 0 || y < 0 || x > BOX || y > BOX) return false;
  const cx = x < R ? R : x > BOX - R ? BOX - R : x;
  const cy = y < R ? R : y > BOX - R ? BOX - R : y;
  const dx = x - cx, dy = y - cy;
  return dx*dx + dy*dy <= R*R;
}
const inHead = (x, y) =>
  (x - HEAD.cx)**2 + (y - HEAD.cy)**2 <= HEAD.r*HEAD.r;

/* nền chuyển màu chéo #5b8cff → #8b5cff, giống linearGradient của SVG */
function bg(x, y){
  const t = Math.max(0, Math.min(1, (x/BOX + y/BOX) / 2));
  return [Math.round(0x5b + (0x8b - 0x5b) * t),
          Math.round(0x8c + (0x5c - 0x8c) * t),
          0xff];
}

/* ---- vẽ một kích thước, khử răng cưa bằng cách lấy mẫu 4x4 ----
   maskable = Android sẽ cắt icon theo hình của máy (tròn, vuông bo…),
   nên bản đó phải tràn viền và thu nhỏ hình vào giữa 80% khung.      */
function pixels(size, maskable){
  const SS = 4, buf = Buffer.alloc(size * size * 4);
  const K = maskable ? 1/0.72 : 1;                 // hệ số thu nhỏ hình
  for (let py = 0; py < size; py++){
    for (let px = 0; px < size; px++){
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++){
        for (let sx = 0; sx < SS; sx++){
          let x = (px + (sx + .5)/SS) / size * BOX;
          let y = (py + (sy + .5)/SS) / size * BOX;
          if (maskable){ x = (x - BOX/2) * K + BOX/2; y = (y - BOX/2) * K + BOX/2; }
          else if (!inRounded(x, y)) continue;
          a++;
          if (inHead(x, y) || inPoly(x, y, domePoly)){ r += 255; g += 255; b += 255; }
          else { const c = bg(x, y); r += c[0]; g += c[1]; b += c[2]; }
        }
      }
      const i = (py * size + px) * 4, n = SS * SS;
      if (a){
        buf[i]   = Math.round(r / a);
        buf[i+1] = Math.round(g / a);
        buf[i+2] = Math.round(b / a);
        buf[i+3] = Math.round(a / n * 255);
      }
    }
  }
  return buf;
}

/* ---- đóng gói PNG ---- */
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf){
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
function png(size, opaque, maskable){
  let raw = pixels(size, maskable);
  if (opaque){                       // nền đặc cho favicon/thông báo
    for (let i = 0; i < raw.length; i += 4){
      const a = raw[i+3] / 255;
      raw[i]   = Math.round(raw[i]   * a + 0x0e * (1 - a));
      raw[i+1] = Math.round(raw[i+1] * a + 0x10 * (1 - a));
      raw[i+2] = Math.round(raw[i+2] * a + 0x14 * (1 - a));
      raw[i+3] = 255;
    }
  }
  const stride = size * 4;
  const lines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++){
    lines[y * (stride + 1)] = 0;     // filter 0 (none)
    raw.copy(lines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(lines, {level:9})),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, {recursive:true});
[['icon-192.png',192,false,false], ['icon-512.png',512,false,false],
 ['icon-maskable-512.png',512,true,true],
 ['apple-touch-icon.png',180,true,false], ['favicon-32.png',32,true,false]
].forEach(([name, size, opaque, maskable]) => {
  const f = path.join(OUT, name);
  fs.writeFileSync(f, png(size, opaque, maskable));
  console.log('✓ assets/' + name + '  (' + Math.round(fs.statSync(f).size/1024*10)/10 + ' KB)');
});
