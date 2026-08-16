<?php
/* ============================================================
   lib.php — phần dùng chung của index.php (API) và cron.php (hẹn giờ)

   Ở đây có: cấu hình, cơ sở dữ liệu, gửi tin Telegram, dựng bản tóm tắt
   hằng ngày, và bộ chạy lời nhắc lặp lại.
   ============================================================ */
declare(strict_types=1);

@ini_set('display_errors', '0');
date_default_timezone_set('Asia/Ho_Chi_Minh');   // mọi giờ giấc tính theo giờ VN

const COOKIE      = 'lh_session';
const SESSION_DAY = 60;      // phiên đăng nhập sống bao lâu
const FAIL_MAX    = 8;       // sai mật khẩu bao nhiêu lần thì khoá
const FAIL_WIN    = 900;     // trong bao nhiêu giây (15 phút)
const PULL_LIMIT  = 500;     // số bản ghi tối đa mỗi lượt kéo về
const REM_WINDOW  = 3600;    // trễ quá 1 tiếng thì thôi, không gửi nữa

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
function loadConfig() {
  if (!is_file(__DIR__ . '/config.php'))
    fail('Chưa có api/config.php — hãy chép config.example.php thành config.php rồi dán mã mật khẩu vào.', 503);
  require_once __DIR__ . '/config.php';
  if (!defined('LH_PASSWORD') || LH_PASSWORD === '' || str_contains(LH_PASSWORD, 'DAN_MA_VAO_DAY'))
    fail('Chưa đặt mật khẩu trong api/config.php. Chạy "node tools/hash-password.js" để tạo mã rồi dán vào.', 503);
}
loadConfig();

$DB_FILE = defined('LH_DB_FILE') ? LH_DB_FILE : __DIR__ . '/data/lifehub.sqlite';

/* ---------------- kết nối ---------------- */
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  global $DB_FILE;

  if (!in_array('sqlite', PDO::getAvailableDrivers(), true))
    fail('Hosting này không bật pdo_sqlite. Xem hướng dẫn trong README.', 503);

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
  /* cấu hình Telegram: để ở máy chủ, không đồng bộ xuống từng máy —
     mã bot là thứ ai cầm được cũng nhắn được vào group của bạn */
  $pdo->exec('CREATE TABLE IF NOT EXISTS conf (k TEXT PRIMARY KEY, v TEXT)');
  /* đã gửi rồi thì thôi, tránh cron chạy lại làm gửi trùng */
  $pdo->exec('CREATE TABLE IF NOT EXISTS sent (k TEXT PRIMARY KEY, at INTEGER)');
  return $pdo;
}

function confGet(string $k, $def = null) {
  $st = db()->prepare('SELECT v FROM conf WHERE k = ?');
  $st->execute([$k]);
  $r = $st->fetch();
  return $r === false ? $def : $r['v'];
}
function confSet(string $k, $v): void {
  db()->prepare('INSERT INTO conf (k, v) VALUES (?, ?)
                 ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, (string)$v]);
}
/* khoá bí mật để gọi cron.php qua đường link, tự sinh lần đầu */
function cronKey(): string {
  $k = confGet('cron_key');
  if (!$k) { $k = bin2hex(random_bytes(12)); confSet('cron_key', $k); }
  return (string)$k;
}

/* ---------------- đọc dữ liệu đã đồng bộ ---------------- */
function itemsOf(string $kind): array {
  $st = db()->prepare('SELECT data FROM items WHERE kind = ? AND deleted = 0');
  $st->execute([$kind]);
  $out = [];
  foreach ($st->fetchAll() as $r) {
    $d = json_decode($r['data'], true);
    if (is_array($d) && empty($d['deleted'])) $out[] = $d;
  }
  return $out;
}

/* ---------------- gửi tin Telegram ---------------- */
function httpPostJson(string $url, array $body, int $timeout = 15): array {
  $json = json_encode($body, JSON_UNESCAPED_UNICODE);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST           => true,
      CURLOPT_POSTFIELDS     => $json,
      CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT        => $timeout,
    ]);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) return ['ok' => false, 'error' => 'Không gọi được Telegram: ' . $err];
  } else {
    $ctx = stream_context_create(['http' => [
      'method'  => 'POST',
      'header'  => "Content-Type: application/json\r\n",
      'content' => $json,
      'timeout' => $timeout,
      'ignore_errors' => true,
    ]]);
    $res = @file_get_contents($url, false, $ctx);
    if ($res === false) return ['ok' => false, 'error' => 'Không gọi được Telegram (hosting chặn kết nối ra ngoài?)'];
  }
  $d = json_decode((string)$res, true);
  if (!is_array($d)) return ['ok' => false, 'error' => 'Telegram trả về thứ không đọc được'];
  if (empty($d['ok'])) return ['ok' => false, 'error' => 'Telegram: ' . ($d['description'] ?? 'lỗi không rõ')];
  return ['ok' => true, 'result' => $d['result'] ?? null];
}

function tgSend(string $text, $topic = null): array {
  $token  = (string)confGet('tg_token', '');
  $chatId = (string)confGet('tg_chat', '');
  if ($token === '') return ['ok' => false, 'error' => 'Chưa có mã bot Telegram'];
  if ($chatId === '') return ['ok' => false, 'error' => 'Chưa chọn group Telegram'];

  $thread = ($topic === null || $topic === '') ? (string)confGet('tg_topic', '') : (string)$topic;
  $body = [
    'chat_id' => $chatId,
    'text'    => $text,
    'parse_mode' => 'HTML',
    'disable_web_page_preview' => true,
  ];
  if ($thread !== '' && ctype_digit($thread)) $body['message_thread_id'] = (int)$thread;

  return httpPostJson("https://api.telegram.org/bot$token/sendMessage", $body);
}
/* chữ do người dùng nhập phải rào lại, nếu không dấu < > sẽ làm hỏng thẻ HTML */
function tgEsc(string $s): string { return htmlspecialchars($s, ENT_NOQUOTES, 'UTF-8'); }

/* ---------------- bản tóm tắt hằng ngày ----------------
   Đọc thẳng dữ liệu đã đồng bộ nên vẫn đúng kể cả khi bạn không mở app. */
function buildDigest(): array {
  $today = date('Y-m-d');
  $md    = date('m-d');
  $lines = [];

  /* việc đến hạn */
  $due = [];
  foreach (itemsOf('tasks') as $t) {
    if (!empty($t['done']) || empty($t['due'])) continue;
    if (substr((string)$t['due'], 0, 10) <= $today) $due[] = $t;
  }
  if ($due) {
    $late = 0;
    foreach ($due as $t) if (substr((string)$t['due'], 0, 10) < $today) $late++;
    $lines[] = '✓ <b>' . count($due) . ' việc đến hạn</b>' . ($late ? " ($late đã trễ)" : '');
    foreach (array_slice($due, 0, 6) as $t) $lines[] = '   • ' . tgEsc((string)($t['title'] ?? ''));
  }

  /* sinh nhật — cả người quen lẫn nhân viên */
  $bdToday = []; $bdSoon = [];
  foreach ([['people', ''], ['staff', ' (nhân viên)']] as [$kind, $tag]) {
    foreach (itemsOf($kind) as $p) {
      $b = (string)($p['birthday'] ?? '');
      if (strlen($b) < 10) continue;
      $pmd = substr($b, 5, 5);
      if ($pmd === $md) { $bdToday[] = ($p['name'] ?? '') . $tag; continue; }
      for ($i = 1; $i <= 7; $i++)
        if ($pmd === date('m-d', strtotime("+$i day"))) { $bdSoon[] = ($p['name'] ?? '') . $tag . " ($i ngày nữa)"; break; }
    }
  }
  if ($bdToday) $lines[] = '🎂 <b>Hôm nay sinh nhật:</b> ' . tgEsc(implode(', ', $bdToday));
  if ($bdSoon)  $lines[] = '🎁 Sắp sinh nhật: ' . tgEsc(implode(', ', $bdSoon));

  /* dịp & lễ — ngày dương kế tiếp đã được app tính sẵn vào nextIso */
  foreach (itemsOf('occasions') as $o) {
    $iso = substr((string)($o['nextIso'] ?? ''), 0, 10);
    if (strlen($iso) < 10) continue;
    $d = (int)floor((strtotime($iso) - strtotime($today)) / 86400);
    $remind = isset($o['remind']) ? (int)$o['remind'] : 7;
    if ($d >= 0 && $d <= $remind)
      $lines[] = '🎊 <b>' . tgEsc((string)($o['title'] ?? '')) . '</b>: '
               . ($d === 0 ? 'hôm nay' : "còn $d ngày") . ' (' . date('d/m', strtotime($iso)) . ')';
  }

  /* việc đã giao đang trễ + tiền ngoài luồng chưa trả */
  $lateCards = 0; $owed = 0; $owedN = 0;
  foreach (itemsOf('cards') as $c) {
    $col = (string)($c['col'] ?? '');
    if ($col !== 'done' && !empty($c['due']) && substr((string)$c['due'], 0, 10) < $today) $lateCards++;
    if (!empty($c['extra']) && empty($c['extraPaidDate'])) { $owed += (int)($c['extraPay'] ?? 0); $owedN++; }
  }
  if ($lateCards) $lines[] = "⚠️ $lateCards việc đã giao đang trễ";
  if ($owed) $lines[] = '💰 Còn nợ công ngoài luồng: <b>' . number_format($owed, 0, ',', '.') . '₫</b>' . " ($owedN việc)";

  return $lines;
}

/* ---------------- bộ chạy lịch ----------------
   Gọi mỗi 5 phút bởi cron. Trả về danh sách việc đã làm để dễ dò lỗi. */
function alreadySent(string $key): bool {
  $st = db()->prepare('SELECT 1 FROM sent WHERE k = ?');
  $st->execute([$key]);
  return (bool)$st->fetch();
}
function markSent(string $key): void {
  db()->prepare('INSERT OR IGNORE INTO sent (k, at) VALUES (?, ?)')->execute([$key, time()]);
  db()->prepare('DELETE FROM sent WHERE at < ?')->execute([time() - 30 * 86400]);
}

function runSchedule(bool $dry = false): array {
  $done = [];
  if (!confGet('tg_enabled')) return ['skipped' => 'Telegram đang tắt'];

  $now   = time();
  $today = date('Y-m-d');
  $wday  = (int)date('w', $now);       // 0 = Chủ nhật, giống JavaScript

  /* --- lời nhắc lặp lại --- */
  foreach (itemsOf('reminders') as $r) {
    if (empty($r['enabled'])) continue;
    $days = array_map('intval', (array)($r['days'] ?? []));
    if (!in_array($wday, $days, true)) continue;

    $time = (string)($r['time'] ?? '');
    if (!preg_match('/^(\d{1,2}):(\d{2})$/', $time, $m)) continue;
    $at = mktime((int)$m[1], (int)$m[2], 0, (int)date('n'), (int)date('j'), (int)date('Y'));

    /* Chưa tới giờ thì chờ. Trễ quá cửa sổ cho phép thì bỏ luôn —
       nhắc "tập gym 18:30" vào lúc 22h thì chỉ gây khó chịu. */
    if ($now < $at || $now - $at > REM_WINDOW) continue;

    $key = 'rem:' . ($r['id'] ?? '?') . ':' . $today;
    if (alreadySent($key)) continue;

    $text = '🔔 <b>' . tgEsc((string)($r['title'] ?? 'Nhắc nhở')) . '</b>'
          . "\n<i>" . $time . '</i>'
          . (!empty($r['note']) ? "\n\n" . tgEsc((string)$r['note']) : '');

    if ($dry) { $done[] = ['reminder' => $r['title'] ?? '', 'dry' => true]; continue; }
    $res = tgSend($text, $r['topic'] ?? null);
    if (!empty($res['ok'])) markSent($key);
    $done[] = ['reminder' => $r['title'] ?? '', 'ok' => !empty($res['ok']),
               'error' => $res['error'] ?? null];
  }

  /* --- bản tóm tắt hằng ngày --- */
  $hour = confGet('tg_digest_hour', '-1');
  if ($hour !== null && (int)$hour >= 0 && (int)date('G', $now) >= (int)$hour) {
    $key = 'digest:' . $today;
    if (!alreadySent($key)) {
      $lines = buildDigest();
      if ($lines) {
        $text = '📋 <b>Life Hub · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines);
        if ($dry) { $done[] = ['digest' => count($lines), 'dry' => true]; }
        else {
          $res = tgSend($text);
          if (!empty($res['ok'])) markSent($key);
          $done[] = ['digest' => count($lines), 'ok' => !empty($res['ok']),
                     'error' => $res['error'] ?? null];
        }
      } else {
        if (!$dry) markSent($key);      // hôm nay không có gì để nhắc
        $done[] = ['digest' => 0, 'note' => 'không có gì cần nhắc'];
      }
    }
  }

  return $done;
}
