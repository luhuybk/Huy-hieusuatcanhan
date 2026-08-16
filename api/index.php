<?php
/* ============================================================
   Life Hub — API đăng nhập + đồng bộ, chạy trên hosting PHP.

   Một điểm vào duy nhất: nhận JSON, trả JSON.
   Dữ liệu nằm ở máy chủ nên đây mới là thứ thật sự bảo vệ nó —
   màn hình đăng nhập ở trình duyệt chỉ là phần nhìn thấy được.
   ============================================================ */
declare(strict_types=1);

/* Lỗi PHP in ra màn hình sẽ chen vào trước JSON và làm hỏng cả câu trả lời.
   Ghi vào log của hosting thì được, in ra thì không. */
@ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const COOKIE      = 'lh_session';
const SESSION_DAY = 60;      // phiên sống bao lâu
const FAIL_MAX    = 8;       // sai bao nhiêu lần thì khoá
const FAIL_WIN    = 900;     // trong bao nhiêu giây (15 phút)
const PULL_LIMIT  = 500;     // số bản ghi tối đa mỗi lượt kéo về

/* Cùng định dạng thời gian với JavaScript (…T…Z, có phần nghìn giây) để
   hai bên so sánh chuỗi ngày với nhau lúc nào cũng ra đúng kết quả. */
function isoNow(int $t = 0): string { return gmdate('Y-m-d\TH:i:s.000\Z', $t ?: time()); }

/* Không đặt kiểu trả về "never": kiểu đó cần PHP 8.1, mà vài gói hosting
   vẫn đang chạy 8.0 — sai chỗ này là trắng trang, không báo gì. */
function out(array $d, int $code = 200) {
  http_response_code($code);
  echo json_encode($d, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

/* ---------------- cấu hình ---------------- */
if (!is_file(__DIR__ . '/config.php'))
  fail('Chưa có api/config.php — hãy chép config.example.php thành config.php rồi dán mã mật khẩu vào.', 503);
require __DIR__ . '/config.php';

if (!defined('LH_PASSWORD') || LH_PASSWORD === '' || str_contains(LH_PASSWORD, 'DAN_MA_VAO_DAY'))
  fail('Chưa đặt mật khẩu trong api/config.php. Chạy "node tools/hash-password.js" để tạo mã rồi dán vào.', 503);

$DB_FILE = defined('LH_DB_FILE') ? LH_DB_FILE : __DIR__ . '/data/lifehub.sqlite';

/* ---------------- kết nối ---------------- */
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  global $DB_FILE;

  if (!in_array('sqlite', PDO::getAvailableDrivers(), true))
    fail('Hosting này không bật pdo_sqlite. Xem hướng dẫn chuyển sang MySQL trong README.', 503);

  $dir = dirname($DB_FILE);
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  /* chặn tải file cơ sở dữ liệu qua trình duyệt, phòng khi nó nằm trong public_html */
  if (is_dir($dir) && !is_file($dir . '/.htaccess'))
    @file_put_contents($dir . '/.htaccess', "Require all denied\nOrder allow,deny\nDeny from all\n");

  try {
    $pdo = new PDO('sqlite:' . $DB_FILE, null, null, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
  } catch (Throwable $e) {
    fail('Không mở được cơ sở dữ liệu. Kiểm tra quyền ghi của thư mục api/data.', 500);
  }
  $pdo->exec('PRAGMA journal_mode = WAL');
  $pdo->exec('PRAGMA busy_timeout = 5000');
  $pdo->exec('CREATE TABLE IF NOT EXISTS items (
      kind TEXT NOT NULL, item_id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, item_id))');
  $pdo->exec('CREATE INDEX IF NOT EXISTS items_upd ON items(updated_at)');
  $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, created_at TEXT, expires_at TEXT, label TEXT)');
  $pdo->exec('CREATE TABLE IF NOT EXISTS login_fails (ip TEXT, at INTEGER)');
  return $pdo;
}

/* ---------------- mật khẩu: PBKDF2-SHA256 ----------------
   Cùng thuật toán với tools/hash-password.js, nên mã tạo ở máy bạn
   dùng được thẳng ở đây mà không cần cài gì thêm.                */
function checkPassword(string $given): bool {
  $parts = explode('$', LH_PASSWORD);
  if (count($parts) !== 4 || $parts[0] !== 'pbkdf2_sha256') return false;
  [, $iter, $saltB64, $hashB64] = $parts;
  $salt = base64_decode($saltB64, true);
  $want = base64_decode($hashB64, true);
  if ($salt === false || $want === false) return false;
  $got = hash_pbkdf2('sha256', $given, $salt, max(1, (int)$iter), strlen($want), true);
  return hash_equals($want, $got);   // so sánh thời gian không đổi
}

/* ---------------- phiên đăng nhập ---------------- */
function cookiePath(): string {
  $p = str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')));
  return ($p === '' || $p === '.') ? '/' : rtrim($p, '/') . '/';
}
function isHttps(): bool {
  return (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
      || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
      || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
}
function setSessionCookie(string $token, int $expires): void {
  setcookie(COOKIE, $token, [
    'expires'  => $expires,
    'path'     => cookiePath(),
    'secure'   => isHttps(),
    'httponly' => true,          // JavaScript không đọc được → kịch bản chèn mã cũng không lấy được
    'samesite' => 'Lax',
  ]);
}
function currentSession(): ?array {
  $tok = $_COOKIE[COOKIE] ?? '';
  if ($tok === '') return null;
  $st = db()->prepare('SELECT * FROM sessions WHERE token_hash = ?');
  $st->execute([hash('sha256', $tok)]);
  $row = $st->fetch();
  if (!$row) return null;
  if ($row['expires_at'] < isoNow()) {
    db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$row['token_hash']]);
    return null;
  }
  return $row;
}
function requireAuth(): void {
  if (!currentSession()) fail('Chưa đăng nhập', 401);
}

/* ---------------- chống dò mật khẩu ---------------- */
function clientIp(): string {
  return (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '?');
}
function failCount(): int {
  db()->prepare('DELETE FROM login_fails WHERE at < ?')->execute([time() - FAIL_WIN]);
  $st = db()->prepare('SELECT COUNT(*) c FROM login_fails WHERE ip = ?');
  $st->execute([clientIp()]);
  return (int)$st->fetch()['c'];
}

/* ---------------- đọc yêu cầu ---------------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Chỉ nhận POST', 405);
/* Bắt buộc JSON: biểu mẫu từ trang web khác không gửi được kiểu này,
   nên đây cũng là lớp chặn giả mạo yêu cầu (CSRF) cùng với SameSite. */
if (!str_contains(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json'))
  fail('Content-Type phải là application/json', 415);

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 12 * 1024 * 1024) fail('Gói dữ liệu quá lớn', 413);
$in = json_decode($raw, true);
if (!is_array($in)) fail('JSON không hợp lệ');
$action = (string)($in['action'] ?? '');

/* ---------------- các hành động ---------------- */
switch ($action) {

  /* ai đang mở? dùng để biết có cần hiện màn đăng nhập không */
  case 'me': {
    $s = currentSession();
    out(['ok' => true, 'auth' => (bool)$s, 'server' => true,
         'expires' => $s['expires_at'] ?? null]);
  }

  case 'login': {
    if (failCount() >= FAIL_MAX)
      fail('Sai quá nhiều lần. Thử lại sau 15 phút.', 429);

    $pw = (string)($in['password'] ?? '');
    if ($pw === '' || !checkPassword($pw)) {
      db()->prepare('INSERT INTO login_fails (ip, at) VALUES (?, ?)')->execute([clientIp(), time()]);
      usleep(400000);                        // làm chậm mỗi lần thử
      $left = max(0, FAIL_MAX - failCount());
      fail($left > 0 ? "Sai mật khẩu. Còn $left lần thử." : 'Sai quá nhiều lần. Thử lại sau 15 phút.', 401);
    }

    db()->prepare('DELETE FROM login_fails WHERE ip = ?')->execute([clientIp()]);
    db()->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([isoNow()]);

    $token = bin2hex(random_bytes(32));
    $exp   = time() + SESSION_DAY * 86400;
    db()->prepare('INSERT INTO sessions (token_hash, created_at, expires_at, label) VALUES (?,?,?,?)')
        ->execute([hash('sha256', $token), isoNow(), isoNow($exp),
                   substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120)]);
    setSessionCookie($token, $exp);
    out(['ok' => true, 'auth' => true, 'expires' => isoNow($exp)]);
  }

  case 'logout': {
    $tok = $_COOKIE[COOKIE] ?? '';
    if ($tok !== '') db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $tok)]);
    setSessionCookie('', time() - 3600);
    out(['ok' => true, 'auth' => false]);
  }

  /* thoát mọi phiên trên mọi máy — dùng khi nghi mật khẩu bị lộ */
  case 'logout_all': {
    requireAuth();
    db()->exec('DELETE FROM sessions');
    setSessionCookie('', time() - 3600);
    out(['ok' => true, 'auth' => false]);
  }

  /* kéo về những bản ghi mới hơn mốc đang giữ */
  case 'pull': {
    requireAuth();
    $since = (string)($in['since'] ?? '');
    $st = db()->prepare('SELECT kind, item_id, data, updated_at, deleted FROM items
                         WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT ' . PULL_LIMIT);
    $st->execute([$since]);
    $rows = $st->fetchAll();
    foreach ($rows as &$r) {
      $r['data']    = json_decode($r['data'], true);
      $r['deleted'] = (bool)$r['deleted'];
    }
    unset($r);
    out(['ok' => true, 'rows' => $rows, 'more' => count($rows) >= PULL_LIMIT, 'now' => isoNow()]);
  }

  /* đẩy lên — bản ghi cũ hơn thứ máy chủ đang giữ thì bỏ qua */
  case 'push': {
    requireAuth();
    $rows = $in['rows'] ?? null;
    if (!is_array($rows)) fail('Thiếu danh sách rows');
    if (count($rows) > 2000) fail('Quá nhiều bản ghi trong một lượt', 413);

    $pdo = db();
    $sel = $pdo->prepare('SELECT updated_at FROM items WHERE kind = ? AND item_id = ?');
    $ins = $pdo->prepare('INSERT INTO items (kind, item_id, data, updated_at, deleted) VALUES (?,?,?,?,?)');
    $upd = $pdo->prepare('UPDATE items SET data = ?, updated_at = ?, deleted = ? WHERE kind = ? AND item_id = ?');

    $saved = 0; $skipped = 0;
    $pdo->beginTransaction();
    try {
      foreach ($rows as $r) {
        $kind = (string)($r['kind'] ?? '');
        $id   = (string)($r['item_id'] ?? '');
        $upAt = (string)($r['updated_at'] ?? '');
        if ($kind === '' || $id === '' || $upAt === '') { $skipped++; continue; }
        $json = json_encode($r['data'] ?? null, JSON_UNESCAPED_UNICODE);
        $del  = !empty($r['deleted']) ? 1 : 0;

        $sel->execute([$kind, $id]);
        $cur = $sel->fetch();
        $sel->closeCursor();                // dùng lại câu lệnh trong vòng lặp thì phải đóng
        if (!$cur)                          { $ins->execute([$kind, $id, $json, $upAt, $del]); $saved++; }
        elseif ($cur['updated_at'] < $upAt) { $upd->execute([$json, $upAt, $del, $kind, $id]); $saved++; }
        else                                { $skipped++; }
      }
      $pdo->commit();
    } catch (Throwable $e) {
      $pdo->rollBack();
      fail('Ghi dữ liệu lỗi', 500);
    }
    out(['ok' => true, 'saved' => $saved, 'skipped' => $skipped, 'now' => isoNow()]);
  }

  /* vài con số để hiện trong Cài đặt */
  case 'stats': {
    requireAuth();
    $n = (int)db()->query('SELECT COUNT(*) c FROM items WHERE deleted = 0')->fetch()['c'];
    $d = (int)db()->query('SELECT COUNT(*) c FROM items WHERE deleted = 1')->fetch()['c'];
    $s = (int)db()->query('SELECT COUNT(*) c FROM sessions')->fetch()['c'];
    $last = db()->query('SELECT MAX(updated_at) m FROM items')->fetch()['m'];
    global $DB_FILE;
    out(['ok' => true, 'records' => $n, 'trashed' => $d, 'devices' => $s, 'last' => $last,
         'size' => is_file($DB_FILE) ? filesize($DB_FILE) : 0]);
  }

  default: fail('Không hiểu yêu cầu: ' . $action, 404);
}
