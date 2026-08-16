<?php
/* ============================================================
   Life Hub — API đăng nhập + đồng bộ, chạy trên hosting PHP.

   Một điểm vào duy nhất: nhận JSON, trả JSON.
   Dữ liệu nằm ở máy chủ nên đây mới là thứ thật sự bảo vệ nó —
   màn hình đăng nhập ở trình duyệt chỉ là phần nhìn thấy được.

   Phần cấu hình, cơ sở dữ liệu và Telegram nằm trong lib.php,
   dùng chung với cron.php.
   ============================================================ */
require_once __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

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

/* Trạng thái Telegram gửi về cho giao diện. Mã bot không bao giờ có ở đây. */
function tgState(): array {
  $base = (isHttps() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'tenmien.com')
        . str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
  return ['ok' => true,
    'hasToken'   => confGet('tg_token', '') !== '',
    'chatId'     => confGet('tg_chat', ''),
    'topic'      => confGet('tg_topic', ''),
    'digestHour' => (int)confGet('tg_digest_hour', '-1'),
    'workHour'   => (int)confGet('tg_work_hour', '-1'),
    'workTopic'  => confGet('tg_work_topic', ''),
    'enabled'    => (bool)confGet('tg_enabled', ''),
    'cron'       => '/usr/bin/php ' . __DIR__ . '/cron.php',
    'cronUrl'    => $base . '/cron.php?key=' . cronKey()];
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

  /* ---------------- Telegram ---------------- */

  /* Cố ý KHÔNG trả mã bot về trình duyệt — chỉ cho biết đã có hay chưa. */
  case 'tg_get': {
    requireAuth();
    out(tgState());
  }

  case 'tg_save': {
    requireAuth();
    if (isset($in['token']) && trim((string)$in['token']) !== '')
      confSet('tg_token', trim((string)$in['token']));
    confSet('tg_chat',  trim((string)($in['chatId'] ?? '')));
    confSet('tg_topic', trim((string)($in['topic'] ?? '')));
    $h = isset($in['digestHour']) ? (int)$in['digestHour'] : -1;
    confSet('tg_digest_hour', ($h >= 0 && $h <= 23) ? $h : -1);
    $w = isset($in['workHour']) ? (int)$in['workHour'] : -1;
    confSet('tg_work_hour', ($w >= 0 && $w <= 23) ? $w : -1);
    confSet('tg_work_topic', trim((string)($in['workTopic'] ?? '')));
    confSet('tg_enabled', !empty($in['enabled']) ? '1' : '');
    out(tgState());
  }

  case 'tg_send': {
    requireAuth();
    $text = trim((string)($in['text'] ?? ''));
    if ($text === '') fail('Không có nội dung để gửi');
    $res = tgSend(tgEsc($text), $in['topic'] ?? null);
    if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    out(['ok' => true]);
  }

  /* Dò xem bot đang ở group nào: đọc các tin nhắn gần đây bot nhìn thấy.
     Vì vậy phải nhắn một câu vào group TRƯỚC khi bấm dò.               */
  case 'tg_discover': {
    requireAuth();
    $token = trim((string)($in['token'] ?? '')) ?: (string)confGet('tg_token', '');
    if ($token === '') fail('Chưa có mã bot — nhập mã rồi bấm dò lại');
    $res = httpPostJson("https://api.telegram.org/bot$token/getUpdates", ['limit' => 100]);
    if (empty($res['ok'])) fail($res['error'] ?? 'Không gọi được Telegram', 502);

    $chats = [];
    foreach ((array)($res['result'] ?? []) as $u) {
      $msg = $u['message'] ?? $u['channel_post'] ?? null;
      if (!$msg || empty($msg['chat']['id'])) continue;
      $id = (string)$msg['chat']['id'];
      if (isset($chats[$id])) continue;
      $chats[$id] = [
        'id'    => $id,
        'title' => $msg['chat']['title'] ?? $msg['chat']['username'] ?? $msg['chat']['first_name'] ?? $id,
        'topic' => $msg['message_thread_id'] ?? '',
      ];
    }
    out(['ok' => true, 'chats' => array_values($chats)]);
  }

  /* chạy thử bộ hẹn giờ mà không gửi gì — để xem lịch có đúng không */
  case 'tg_dryrun': {
    requireAuth();
    out(['ok' => true, 'result' => runSchedule(true), 'digest' => buildDigest(), 'work' => buildWork()]);
  }

  /* Gửi bảng công việc ngay bây giờ, không chờ tới giờ đã hẹn. */
  case 'tg_work_now': {
    requireAuth();
    $lines = buildWork();
    if (!$lines) out(['ok' => true, 'empty' => true]);
    $res = tgSend('🗂 <b>Công việc · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines), workTopic());
    if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    out(['ok' => true, 'lines' => count($lines)]);
  }

  /* vài con số để hiện trong Cài đặt */
  case 'stats': {
    requireAuth();
    $n = (int)db()->query('SELECT COUNT(*) c FROM items WHERE deleted = 0')->fetch()['c'];
    $d = (int)db()->query('SELECT COUNT(*) c FROM items WHERE deleted = 1')->fetch()['c'];
    $s = (int)db()->query('SELECT COUNT(*) c FROM sessions')->fetch()['c'];
    $last = db()->query('SELECT MAX(updated_at) m FROM items')->fetch()['m'];
    global $DB_FILE;

    /* Gốc repo giờ chính là public_html. Nếu file dữ liệu cũng nằm trong đó
       thì một lần deploy dọn sạch thư mục là mất hết. Cảnh báo ngay. */
    $inWebRoot = false;
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    $dbDir = realpath(dirname($DB_FILE));
    if ($root && $dbDir) $inWebRoot = str_starts_with($dbDir . DIRECTORY_SEPARATOR,
                                                      $root . DIRECTORY_SEPARATOR);

    out(['ok' => true, 'records' => $n, 'trashed' => $d, 'devices' => $s, 'last' => $last,
         'size' => is_file($DB_FILE) ? filesize($DB_FILE) : 0,
         'dbInWebRoot' => $inWebRoot, 'dbDir' => $inWebRoot ? dirname($DB_FILE) : '']);
  }

  default: fail('Không hiểu yêu cầu: ' . $action, 404);
}
