/* Máy chủ tĩnh nhỏ để chạy thử trên máy tính.
   Mặc định phục vụ dist/ — tức đúng thứ sẽ nằm trên Hostinger.
   Cần dùng khi muốn thử chế độ cài như app (service worker) hoặc thông báo,
   vì hai thứ đó không hoạt động với file://

     node build.js && node serve.js     → http://localhost:5199
     node serve.js --src                → phục vụ thư mục nguồn (không có ?v=)  */
const http = require('http');
const fs   = require('fs');
const path = require('path');

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

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'   // chạy thử thì luôn lấy bản mới nhất
    });
    res.end(data);
  });
}).listen(PORT, () => console.log('Life Hub (' + (useSrc ? 'nguồn' : 'dist') + ') → http://localhost:' + PORT));
