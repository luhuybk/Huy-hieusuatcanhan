/* Đóng gói Life Hub để đưa lên máy chủ (Hostinger…).
   Chạy:  node build.js

   Tạo ra hai thứ:
     dist/                     ← thư mục đem upload thẳng lên public_html
     life-hub-standalone.html  ← một tệp duy nhất, tiện gửi qua Zalo/mail

   Chỉ những tệp cần cho người dùng mới vào dist/. Mã nguồn phụ trợ
   (build.js, serve.js, supabase-schema.sql, README) ở lại trên máy —
   đưa lên máy chủ là ai cũng tải về đọc được.                         */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir  = __dirname;
const DIST = path.join(dir, 'dist');
const read = p => fs.readFileSync(path.join(dir, p), 'utf8');

const JS = ['js/state.js','js/lunar.js','js/voice.js','js/sync.js',
            'js/notify.js','js/views.js','js/app.js'];
const ASSETS = ['assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png',
                'assets/apple-touch-icon.png','assets/favicon-32.png'];

/* icon PNG được sinh ra từ icon.svg, chưa có thì tạo luôn */
if (!fs.existsSync(path.join(dir, 'assets/icon-192.png'))) require('./tools/make-icons.js');

/* ---------- mã phiên bản: đổi khi và chỉ khi mã nguồn đổi ---------- */
const srcFiles = ['index.html', 'css/style.css', ...JS];
const VERSION = crypto.createHash('sha1')
  .update(srcFiles.map(read).join('\0')).digest('hex').slice(0, 8);

/* ---------- dist/ ---------- */
fs.rmSync(DIST, {recursive:true, force:true});
const put = (rel, data) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), {recursive:true});
  fs.writeFileSync(f, data);
};
const copy = rel => put(rel, fs.readFileSync(path.join(dir, rel)));

/* index.html: gắn ?v= vào css/js để trình duyệt không dùng bản cũ sau khi cập nhật */
put('index.html', read('index.html')
  .replace('href="css/style.css"', () => `href="css/style.css?v=${VERSION}"`)
  .replace(/src="(js\/[a-z]+\.js)"/g, (_, p) => `src="${p}?v=${VERSION}"`));

copy('css/style.css');
JS.forEach(copy);
copy('manifest.webmanifest');
copy('icon.svg');
ASSETS.forEach(copy);

/* sw.js: đóng dấu phiên bản + danh sách tệp có kèm ?v= */
const swAssets = ['./', './index.html', `./css/style.css?v=${VERSION}`,
  ...JS.map(f => `./${f}?v=${VERSION}`),
  './manifest.webmanifest', './icon.svg', ...ASSETS.map(a => './' + a)];
put('sw.js', read('sw.js')
  .replace(/^const VERSION = .*$/m, () => `const VERSION = '${VERSION}';`)
  .replace(/^const ASSETS = \[[\s\S]*?\];$/m, () =>
    'const ASSETS = [\n  ' + swAssets.map(a => `'${a}'`).join(',\n  ') + '\n];'));

/* ---------- cấu hình máy chủ ---------- */
put('.htaccess', `# Life Hub — cấu hình cho Apache/LiteSpeed (Hostinger)

# --- luôn dùng https ---
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</IfModule>

# --- kiểu tệp (một số máy chủ chưa biết .webmanifest) ---
<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
  AddType text/javascript           .js
  AddType image/svg+xml             .svg
  AddCharset UTF-8 .html .css .js .json .webmanifest
</IfModule>

# --- nén ---
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/manifest+json image/svg+xml
</IfModule>

# --- bộ nhớ đệm ---
<IfModule mod_headers.c>
  # css/js luôn kèm ?v=… nên giữ lâu được; đổi mã nguồn là đổi địa chỉ
  <FilesMatch "\\.(css|js)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.(png|svg)$">
    Header set Cache-Control "public, max-age=2592000"
  </FilesMatch>
  # ba tệp này phải luôn hỏi lại máy chủ, nếu không sẽ kẹt ở bản cũ
  <FilesMatch "^(index\\.html|sw\\.js|manifest\\.webmanifest)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  # app riêng tư — đừng để bị lập chỉ mục
  Header set X-Robots-Tag "noindex, nofollow"
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "no-referrer"
</IfModule>

# --- không cho liệt kê thư mục ---
Options -Indexes
DirectoryIndex index.html

# --- chặn các tệp không nên lộ ---
<FilesMatch "^\\.|\\.(sql|md|json)$">
  Require all denied
</FilesMatch>
`);

put('robots.txt', 'User-agent: *\nDisallow: /\n');

/* ---------- bản một tệp ---------- */
const css = read('css/style.css');
const js  = JS.map(f => `/* ===== ${f} ===== */\n` + read(f)).join('\n\n');

/* Dùng hàm thay thế, KHÔNG dùng chuỗi: trong chuỗi thay thế, "$$" bị hiểu là
   một ký tự "$" và "$&" bị hiểu là phần khớp — sẽ làm hỏng mã nguồn. */
const single = read('index.html')
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/g, '')
  .replace('<link rel="stylesheet" href="css/style.css">', () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="js\/[a-z]+\.js"><\/script>\s*/g, '')
  .replace('</body>', () => '<script>\n' + js + '\n</script>\n</body>');

/* bắt lỗi cú pháp ngay tại đây thay vì để trang trắng trên điện thoại */
new Function(js);

const out = path.join(dir, 'life-hub-standalone.html');
fs.writeFileSync(out, single);

/* ---------- báo cáo ---------- */
const size = p => Math.round(fs.statSync(p).size / 1024);
const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const total = walk(DIST).reduce((s,f) => s + fs.statSync(f).size, 0);

console.log(`✓ dist/                     ${walk(DIST).length} tệp · ${Math.round(total/1024)} KB · phiên bản ${VERSION}`);
console.log(`✓ life-hub-standalone.html  ${size(out)} KB`);
console.log('\nUpload toàn bộ NỘI DUNG trong dist/ vào public_html trên Hostinger.');
