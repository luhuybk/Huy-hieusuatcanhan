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
const ESCALATE_DAYS = [3, 7, 14, 30];   // mốc ngày trễ để báo leo thang, mỗi mốc chỉ báo một lần
/* các mức dời nhắc, tính bằng phút — phải khớp với SNOOZE trong js/app.js */
const SNOOZE_MINS = [240 => '4 giờ', 720 => '12 giờ', 1440 => '1 ngày', 4320 => '3 ngày'];

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
  /* tin đã gửi kèm nút bấm — nhớ message_id để sau còn gỡ nút xuống */
  $pdo->exec('CREATE TABLE IF NOT EXISTS tgmsg (
      k TEXT PRIMARY KEY, msg INTEGER, txt TEXT, at INTEGER)');
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

function tgSend(string $text, $topic = null, ?array $keyboard = null): array {
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
  if ($keyboard !== null) $body['reply_markup'] = ['inline_keyboard' => $keyboard];

  return httpPostJson("https://api.telegram.org/bot$token/sendMessage", $body);
}

/* Nút dưới tin nhắc — chỉ đính kèm khi đã bật webhook, nếu không bấm vào
   cũng chẳng có gì lắng nghe, chỉ gây khó hiểu.
   Hàng đầu "Xong", rồi các mức dời lại xếp HAI nút một hàng. Bốn nút một
   hàng nhìn trên máy tính thì vừa, nhưng trên điện thoại bị bóp đến mức
   nhãn xuống dòng, chữ chồng lên nhau và rất dễ bấm nhầm mức. */
function tgItemButtons(string $kind, string $id): ?array {
  if (!confGet('tg_webhook_on')) return null;
  $rows = [[['text' => '✅ Xong', 'callback_data' => 'done:' . $kind . ':' . $id]]];
  foreach (array_chunk(SNOOZE_MINS, 2, true) as $pair) {
    $row = [];
    foreach ($pair as $mins => $label)
      $row[] = ['text' => '⏰ ' . $label, 'callback_data' => 'snz:' . $kind . ':' . $id . ':' . $mins];
    $rows[] = $row;
  }
  return $rows;
}

/* Nút "Xong hôm nay" dưới lời nhắc lặp lại. Không dùng chung tgItemButtons()
   được: nhắc lặp lại không có ngày hạn để dời, tick xong là xong kỳ này. */
function tgRemButtons(string $id): ?array {
  if (!confGet('tg_webhook_on')) return null;
  return [[['text' => '✅ Xong hôm nay', 'callback_data' => 'remdone:' . $id]]];
}
/* Ý tưởng tới hẹn xem lại: ba lựa chọn, hai dòng cho vừa màn hình điện
   thoại. Mã bấm dài nhất "idea:snz:<id>:m3" ~ 26 byte, thừa sức trong
   giới hạn 64 byte của Telegram. */
function tgIdeaButtons(string $id): ?array {
  if (!confGet('tg_webhook_on')) return null;
  return [[['text' => '▶ Triển khai', 'callback_data' => 'idea:go:' . $id],
           ['text' => '🗄 Gác lại',   'callback_data' => 'idea:drop:' . $id]],
          [['text' => '⏰ Nhắc lại sau 3 tháng', 'callback_data' => 'idea:snz:' . $id . ':m3']]];
}

/* Id cho bản ghi do máy chủ tạo ra (mẩu ghi nhanh nhắn từ Telegram).
   Không cần trùng kiểu với uid() bên JavaScript, chỉ cần không đụng nhau. */
function newId(): string { return dechex(time()) . bin2hex(random_bytes(4)); }

/* ---------------- việc lặp lại ----------------
   Bản song sinh của stepRepeat()/nextRepeat() trong js/state.js. Luật phải
   giống hệt: bấm "Xong" trên Telegram mà ra hạn khác với bấm trong app thì
   dữ liệu lệch nhau, và người dùng không đời nào đoán được vì sao. */
function monthlyOrd(string $code): string {
  return preg_match('/^mw([1-4L])$/', $code, $m) ? $m[1] : '';
}
/* Ngày của "thứ $wd lần thứ $ord" trong tháng $mo (1-12). '' nếu tháng đó
   không có lần thứ $ord — tháng nào cũng đủ bốn lần, nhưng cứ chặn cho chắc. */
function nthWeekday(int $y, int $mo, int $wd, string $ord): string {
  if ($ord === 'L') {
    $t = mktime(0, 0, 0, $mo + 1, 0, $y);                 /* ngày cuối tháng */
    $t -= (((int)date('w', $t) - $wd + 7) % 7) * 86400;
    return date('Y-m-d', $t);
  }
  $t = mktime(0, 0, 0, $mo, 1, $y);
  $t += ((($wd - (int)date('w', $t) + 7) % 7) + ((int)$ord - 1) * 7) * 86400;
  return (int)date('n', $t) === $mo ? date('Y-m-d', $t) : '';
}
function stepRepeat(string $iso, string $code): string {
  /* Hàng tháng theo THỨ: thứ 7 cuối cùng của tháng không phải một ngày cố
     định nên không cộng ngày ra được, phải dò lại trong tháng kế tiếp. */
  $ord = monthlyOrd($code);
  if ($ord !== '') {
    $wd = (int)date('w', strtotime($iso));
    $y  = (int)substr($iso, 0, 4);
    $mo = (int)substr($iso, 5, 2) + 1;
    if ($mo > 12) { $mo = 1; $y++; }
    $r = nthWeekday($y, $mo, $wd, $ord);
    return $r !== '' ? $r : date('Y-m-d', strtotime($iso . ' +1 month'));
  }
  $unit = $code[0];
  $n = max(1, (int)substr($code, 1));
  if ($unit === 'd') return date('Y-m-d', strtotime($iso . ' +' . $n . ' day'));
  if ($unit === 'w') return date('Y-m-d', strtotime($iso . ' +' . (7 * $n) . ' day'));

  $months = $unit === 'm' ? $n : 12 * $n;
  $day = (int)substr($iso, 8, 2);
  $t = strtotime($iso . ' +' . $months . ' month');
  /* 31/1 cộng một tháng phải ra 28/2, chứ PHP mặc định nhảy sang 3/3 */
  if ((int)date('j', $t) < $day) $t = strtotime(date('Y-m-01', $t) . ' -1 day');
  return date('Y-m-d', $t);
}
function isRepeat($code): bool { return (bool)preg_match('/^([dwmy]\d+|mw[1-4L])$/', (string)$code); }
function nextRepeat(string $iso, string $code): string {
  if (!isRepeat($code)) return '';
  $today = date('Y-m-d');
  $base  = $iso !== '' ? $iso : $today;
  $guard = 0;
  /* luôn nhảy tới mốc trong tương lai — bỏ lỡ mấy kỳ cũng không bị dồn việc */
  do { $base = stepRepeat($base, $code); } while ($base < $today && ++$guard < 400);
  return $base;
}

/* Nội dung tin nhắc lặp lại. Tách hàm để nút "Gửi thử ngay" trong app và
   bộ hẹn giờ dùng chung một chỗ — trước đây nút thử tự ghép chuỗi riêng
   nên gửi ra tin trơn, không có nút "Xong hôm nay", làm người dùng tưởng
   cả tính năng chưa chạy. */
/* "45p", "1h30" — viết y hệt bên app để hai nơi không ra hai kiểu chữ */
function durText(int $m): string {
  $v = max(0, $m);
  if ($v < 60) return $v . 'p';
  $h = intdiv($v, 60); $r = $v % 60;
  return $r ? $h . 'h' . str_pad((string)$r, 2, '0', STR_PAD_LEFT) : $h . 'h';
}
/* Bỏ trống hay số vô lý thì về 15 phút, số quá lớn cắt xuống 12 tiếng —
   cùng luật với cleanMins() bên app, đừng để hai nơi ra hai con số */
function remMinutes(array $r): int {
  $n = (int)round((float)($r['mins'] ?? 0));
  return $n > 0 ? min($n, 720) : 15;
}
/* ---- hình dạng của ngày hôm nay ----
   Gom việc hằng ngày của thứ này với việc lẻ đến hạn đã có giờ nhắc, để bản
   tóm tắt sáng nói được ngay: kín bao nhiêu, chồng chỗ nào, trống khúc nào.
   Cùng luật với todayItems() bên app — sửa một bên thì phải sửa bên kia. */
function hhmmMin(string $s): ?int {
  return preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', trim($s), $m)
       ? (int)$m[1] * 60 + (int)$m[2] : null;
}
/* Nửa đêm ở mốc kết thúc phải viết 24:00, chứ 00:00 đọc ra như đầu ngày */
function winText(int $m): string { return $m >= 1440 ? '24:00' : hhmmText($m); }
function hhmmText(int $m): string {
  $v = max(0, $m);
  return sprintf('%02d:%02d', intdiv($v, 60) % 24, $v % 60);
}
/* Việc lẻ chưa ước tính thì tạm tính 30 phút, giống taskMins() bên app */
function taskMinutes(array $t): int {
  $n = (int)round((float)($t['mins'] ?? 0));
  return $n > 0 ? min($n, 720) : 30;
}
/* ---- ngoại lệ một lần ----
   Bản song sinh của khối cùng tên trong js/state.js. Việc lặp chỉ giữ MỘT
   giờ dùng chung cho mọi kỳ, nên "hôm nay dời sang tối" phải ghi vào bảng
   phụ `exc`, khoá là NGÀY GỐC. Bên này không đọc đúng bảng đó thì bot vẫn
   nhắc theo giờ cũ, và tin Telegram nói khác hẳn màn hình đang mở. */
function excEntry(array $o, string $day): array {
  $m = $o['exc'] ?? null;
  if (!is_array($m) || !isset($m[$day]) || !is_array($m[$day])) return [];
  return $m[$day];
}
/* Giờ thật của việc hằng ngày vào $day; null = hôm đó không có lần nào */
function remTimeOnPhp(array $r, string $day): ?string {
  $wd = (int)date('w', strtotime($day));
  if (!in_array($wd, array_map('intval', (array)($r['days'] ?? [])), true)) return null;
  $e = excEntry($r, $day);
  if (!empty($e['off'])) return null;
  if (!empty($e['d']) && (string)$e['d'] !== $day) return null;
  $at = (string)($e['at'] ?? '');
  return $at !== '' ? $at : (string)($r['time'] ?? '');
}
/* Ngày & giờ thật của kỳ đang tới. Thẻ giao việc không lặp nên hai hàm này
   trả về đúng giá trị gốc — dùng chung được cho cả hai loại. */
function taskDayPhp(array $t): string {
  $due = substr((string)($t['due'] ?? ''), 0, 10);
  if (empty($t['repeat']) || strlen($due) < 10) return $due;
  $e = excEntry($t, $due);
  return (empty($e['off']) && !empty($e['d'])) ? (string)$e['d'] : $due;
}
function taskAtPhp(array $t): string {
  $due = substr((string)($t['due'] ?? ''), 0, 10);
  $e = empty($t['repeat']) ? [] : excEntry($t, $due);
  $at = (string)($e['at'] ?? '');
  if ($at !== '' && empty($e['off'])) return $at;
  return (string)($t['remindAt'] ?? '');
}
function taskSkippedPhp(array $t): bool {
  if (empty($t['repeat'])) return false;
  $e = excEntry($t, substr((string)($t['due'] ?? ''), 0, 10));
  return !empty($e['off']);
}
function remDoneTodayPhp(array $r): bool {
  $today = date('Y-m-d');
  foreach ((array)($r['doneLog'] ?? []) as $d)
    if (substr((string)$d, 0, 10) === $today) return true;
  return false;
}
/* Việc lẻ tick xong thì cờ done bật; việc lặp lại tick xong thì hạn nhảy kỳ
   sau và chỉ doneLog ghi lại — dò hai kiểu khác nhau, y như bên app. */
function taskDoneTodayPhp(array $t): bool {
  $today = date('Y-m-d');
  if (!empty($t['repeat'])) {
    foreach ((array)($t['doneLog'] ?? []) as $d)
      if (substr((string)$d, 0, 10) === $today) return true;
    return false;
  }
  return !empty($t['done']) && substr((string)($t['doneAt'] ?? ''), 0, 10) === $today;
}
function taskOnTodayPhp(array $t): bool {
  if (taskDoneTodayPhp($t)) return true;
  if (!empty($t['done']) || taskSkippedPhp($t)) return false;
  $due = taskDayPhp($t);
  return strlen($due) === 10 && $due <= date('Y-m-d');
}
/* Việc đến hạn mà chưa đặt giờ — chưa nằm trên trục nhưng vẫn phải làm */
function todayUnsched(): array {
  $out = [];
  foreach (itemsOf('tasks') as $t) {
    if (!taskOnTodayPhp($t)) continue;
    if (hhmmMin(taskAtPhp($t)) !== null) continue;
    $out[] = ['title' => (string)($t['title'] ?? ''), 'mins' => taskMinutes($t),
              'done' => taskDoneTodayPhp($t), 'est' => (int)round((float)($t['mins'] ?? 0)) > 0];
  }
  return $out;
}
/* Gộp mốc CÙNG NGUỒN mà chồng giờ nhau. Bản song sinh của feedMerge() trong
   js/state.js. Không gộp ở đây thì con số "kín / trống" trong tin Telegram
   khác con số trên màn hình, và lúc cần quyết định mình sẽ tin nhầm cái tiện
   hơn. Chỉ gộp khi THỰC SỰ chồng nhau — hai việc nối đuôi vẫn là hai việc. */
function feedMerge(array $list): array {
  $bySrc = [];
  foreach ($list as $x) $bySrc[(string)($x['feed'] ?? '')][] = $x;
  $out = [];
  foreach ($bySrc as $arr) {
    /* cùng giờ thì việc dài nhất lên đầu — nó là cái neo của khung giờ đó */
    usort($arr, fn($a, $b) => [$a['start'], -$a['mins']] <=> [$b['start'], -$b['mins']]);
    $cur = null;
    $flush = function () use (&$cur, &$out) {
      if ($cur === null) return;
      $n = count($cur['parts']);
      $x = $cur['first'];
      $x['start'] = $cur['start'];
      $x['mins']  = $cur['end'] - $cur['start'];
      if ($n > 1) $x['title'] = $n . ' việc cùng lúc (' . implode(', ', $cur['parts']) . ')';
      $out[] = $x;
      $cur = null;
    };
    foreach ($arr as $x) {
      if ($cur !== null && $x['start'] < $cur['end']) {
        $cur['end'] = max($cur['end'], $x['start'] + $x['mins']);
        $cur['parts'][] = $x['title'];
        continue;
      }
      $flush();
      $cur = ['first' => $x, 'start' => $x['start'],
              'end' => $x['start'] + $x['mins'], 'parts' => [$x['title']]];
    }
    $flush();
  }
  return $out;
}
function todaySlots(): array {
  $today = date('Y-m-d');
  $wday  = (int)date('w');          /* 0 = Chủ nhật, khớp với getDay() bên app */
  $out = [];
  foreach (itemsOf('reminders') as $r) {
    if (empty($r['enabled'])) continue;
    $st = hhmmMin((string)remTimeOnPhp($r, $today));
    if ($st === null) continue;
    $out[] = ['start' => $st, 'mins' => remMinutes($r), 'title' => (string)($r['title'] ?? ''),
              'done' => remDoneTodayPhp($r), 'est' => true];
  }
  foreach (itemsOf('tasks') as $t) {
    if (!taskOnTodayPhp($t)) continue;
    $st = hhmmMin(taskAtPhp($t));
    if ($st === null) continue;      /* chưa xếp giờ thì chưa nằm trên trục */
    $out[] = ['start' => $st, 'mins' => taskMinutes($t), 'title' => (string)($t['title'] ?? ''),
              'done' => taskDoneTodayPhp($t), 'est' => (int)round((float)($t['mins'] ?? 0)) > 0];
  }
  /* Lịch nhập từ app khác cũng chiếm giờ thật. Không kể vào đây thì con số
     "trống" trong tin Telegram sẽ rộng hơn con số trong app, và mình sẽ tin
     con số nào tiện hơn. Nó không tick được nên luôn coi là chưa xong. */
  $fd = [];
  foreach (itemsOf('feeds') as $f) {
    $date = (string)($f['date'] ?? '');
    $days = array_map('intval', (array)($f['days'] ?? []));
    if ($date !== '' ? substr($date, 0, 10) !== $today : !in_array($wday, $days, true)) continue;
    $st = hhmmMin((string)($f['time'] ?? ''));
    if ($st === null) continue;
    $title = (string)($f['title'] ?? '');
    if ($title === '') continue;
    $fd[] = ['start' => $st, 'mins' => remMinutes($f), 'title' => $title,
             'done' => false, 'est' => true,
             'feed' => (string)($f['srcName'] ?? $f['src'] ?? '')];
  }
  foreach (feedMerge($fd) as $x) $out[] = $x;
  usort($out, fn($a, $b) => $a['start'] <=> $b['start']);
  return $out;
}
function slotClashes(array $items): int {
  $hit = []; $n = count($items);
  for ($i = 0; $i < $n; $i++)
    for ($j = $i + 1; $j < $n; $j++) {
      $a = $items[$i]; $b = $items[$j];
      if ($b['start'] < $a['start'] + $a['mins'] && $a['start'] < $b['start'] + $b['mins']) {
        $hit[$i] = true; $hit[$j] = true;
      }
    }
  return count($hit);
}
/* Gộp khoảng bận (kể cả chồng nhau) — cần $items đã xếp theo giờ */
function slotBusy(array $items): array {
  $sp = [];
  foreach ($items as $x) {
    $a = $x['start']; $b = $x['start'] + $x['mins'];
    $k = count($sp) - 1;
    if ($k >= 0 && $a <= $sp[$k][1]) $sp[$k][1] = max($sp[$k][1], $b);
    else $sp[] = [$a, $b];
  }
  return $sp;
}
/* Cửa sổ làm việc, "08:30" → 510. 24:00 hợp lệ vì mốc kết thúc có thể là
   nửa đêm — cùng luật với workWindow() bên app. */
function winMinutes(string $v, int $def): int {
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', trim($v), $m)) return $def;
  $n = (int)$m[1] * 60 + (int)$m[2];
  return ((int)$m[2] < 60 && $n >= 0 && $n <= 1440) ? $n : $def;
}
/* Cửa sổ của một thứ (0 = Chủ nhật). work_week là JSON {thứ: "HH:MM-HH:MM"|"off"},
   thiếu mục nào thì lùi về cặp work_from/work_to — cùng luật với workWindow() bên app. */
function workWin(?int $wd = null): array {
  $d = $wd === null ? (int)date('w') : $wd;
  $week = json_decode((string)confGet('work_week', ''), true);
  $raw = '';
  if (is_array($week)) {
    if (isset($week[$d])) $raw = (string)$week[$d];
    elseif (isset($week[(string)$d])) $raw = (string)$week[(string)$d];
  }
  if ($raw === 'off') return ['from' => 0, 'to' => 0, 'off' => true];
  $f = -1; $t = -1;
  if (preg_match('/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/', $raw, $m)) {
    $f = winMinutes($m[1], -1); $t = winMinutes($m[2], -1);
  }
  if ($f < 0) $f = winMinutes((string)confGet('work_from', '08:30'), 510);
  if ($t < 0) $t = winMinutes((string)confGet('work_to', '24:00'), 1440);
  return $t > $f ? ['from' => $f, 'to' => $t, 'off' => false]
                 : ['from' => 510, 'to' => 1440, 'off' => false];
}
/* Khoảng hở bên trong cửa sổ, kể cả đoạn đầu ngày và cuối ngày */
function slotGaps(array $items, int $min = 30): array {
  $w = workWin();
  if (!empty($w['off'])) return [];
  $sp = [];
  foreach (slotBusy($items) as $x) {
    $a = max($x[0], $w['from']); $b = min($x[1], $w['to']);
    if ($b > $a) $sp[] = [$a, $b];
  }
  $out = []; $cur = $w['from'];
  foreach ($sp as $x) {
    if ($x[0] - $cur >= $min) $out[] = ['from' => $cur, 'to' => $x[0], 'mins' => $x[0] - $cur];
    $cur = max($cur, $x[1]);
  }
  if ($w['to'] - $cur >= $min) $out[] = ['from' => $cur, 'to' => $w['to'], 'mins' => $w['to'] - $cur];
  return $out;
}
/* Kín trong cửa sổ; Kín + Trống luôn đúng bằng độ dài cửa sổ */
function slotBusyMins(array $items): int {
  $w = workWin();
  if (!empty($w['off'])) return 0;
  $n = 0;
  foreach (slotBusy($items) as $x) $n += max(0, min($x[1], $w['to']) - max($x[0], $w['from']));
  return $n;
}

function remText(array $r): string {
  $mins = remMinutes($r);
  return '🔔 <b>' . tgEsc((string)($r['title'] ?? 'Nhắc nhở')) . '</b>'
       . "\n<i>" . tgEsc((string)($r['time'] ?? '')) . ' · ' . durText($mins) . '</i>'
       . (!empty($r['note']) ? "\n\n" . tgEsc((string)$r['note']) : '');
}
function remTopic(array $r) {
  $own = trim((string)($r['topic'] ?? ''));
  return $own !== '' ? $own : topicFor('rem');
}

/* Hướng dẫn dùng bot, trả lời cho /help và cho lệnh gõ sai. Không có cái
   này thì người dùng gõ "/tìm thêm việc" rồi ngồi chờ trong im lặng. */
function tgHelpText(): string {
  return "🤖 <b>Life Hub bot</b>\n\n"
       . "<b>/ghi</b> &lt;nội dung&gt; — ghi vào Hộp ghi nhanh\n"
       . "   ví dụ: <code>/ghi mua thêm dầu gội</code>\n"
       . "<b>/help</b> — bảng này\n\n"
       . "Gõ dấu <b>/</b> là Telegram hiện sẵn danh sách lệnh.\n\n"
       . "Muốn gõ gọn bằng dấu <b>+</b> (<code>+ gọi anh Tuấn</code>) thì nhắn "
       . "@BotFather → /setprivacy → chọn bot này → <b>Disable</b>.\n\n"
       . "Còn lại app tự nhắn cho bạn: việc tới hạn, việc trễ, tóm tắt ngày và tuần.";
}

/* khoá bí mật để Telegram tự xác thực khi gọi webhook.php — sinh một lần */
function webhookSecret(): string {
  $k = confGet('tg_webhook_secret');
  if (!$k) { $k = bin2hex(random_bytes(16)); confSet('tg_webhook_secret', $k); }
  return (string)$k;
}
/* chữ do người dùng nhập phải rào lại, nếu không dấu < > sẽ làm hỏng thẻ HTML */
function tgEsc(string $s): string { return htmlspecialchars($s, ENT_NOQUOTES, 'UTF-8'); }

/* ---------------- bản tóm tắt hằng ngày ----------------
   Đọc thẳng dữ liệu đã đồng bộ nên vẫn đúng kể cả khi bạn không mở app. */
function buildDigest(): array {
  $today = date('Y-m-d');
  $md    = date('m-d');
  $lines = [];

  /* Hình dạng của ngày, đặt lên đầu: biết ngày dồn chỗ nào lúc 7h sáng thì
     còn dời được, biết lúc 18h30 thì chỉ còn bực. */
  $slots = todaySlots();
  if ($slots) {
    $tot = 0; foreach ($slots as $x) $tot += $x['mins'];
    $cl   = slotClashes($slots);
    $gaps = slotGaps($slots);
    $w    = workWin();
    $free = max(0, ($w['to'] - $w['from']) - slotBusyMins($slots));
    $line = '🗓 <b>Hôm nay ' . count($slots) . ' việc theo giờ · ' . durText($tot) . '</b>'
          . (!empty($w['off'])
             ? "\n   😴 Hôm nay là <b>ngày nghỉ</b> mà vẫn có việc xếp trong ngày"
             : "\n   Cửa sổ " . winText($w['from']) . '–' . winText($w['to'])
               . ' · kín ' . durText(slotBusyMins($slots)) . ' · trống ' . durText($free));
    if ($cl) $line .= "\n   ⚠️ <b>" . $cl . ' việc chồng giờ</b>';
    if ($gaps) {
      $txt = [];
      foreach (array_slice($gaps, 0, 3) as $g) $txt[] = winText($g['from']) . '–' . winText($g['to']);
      $line .= "\n   Còn rảnh: " . implode(', ', $txt) . (count($gaps) > 3 ? '…' : '');
    }
    $lines[] = $line;
  }

  /* Việc đến hạn. Nếu bảng công việc riêng đang bật thì bỏ khối này đi,
     không ai muốn đọc cùng một danh sách hai lần trong một buổi sáng. */
  $due = [];
  if ((int)confGet('tg_work_hour', '-1') < 0)
  foreach (itemsOf('tasks') as $t) {
    if (!empty($t['done']) || empty($t['due']) || taskSkippedPhp($t)) continue;
    if (taskDayPhp($t) <= $today) $due[] = $t;
  }
  if ($due) {
    $late = 0;
    foreach ($due as $t) if (taskDayPhp($t) < $today) $late++;
    $lines[] = '✓ <b>' . count($due) . ' việc đến hạn</b>' . ($late ? " ($late đã trễ)" : '');
    /* Việc dời tới lần thứ ba là việc mình đang né chứ không phải việc bận —
       nói ra lúc 7h sáng thì còn kịp chia nhỏ hoặc bỏ hẳn. */
    foreach (array_slice($due, 0, 6) as $t) {
      $n = (int)($t['pushes'] ?? 0);
      $lines[] = '   • ' . tgEsc((string)($t['title'] ?? ''))
               . ($n >= 3 ? ' — <i>đã dời ' . $n . ' lần</i>' : '');
    }
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
  if ($lateCards && (int)confGet('tg_work_hour', '-1') < 0)
    $lines[] = "⚠️ $lateCards việc đã giao đang trễ";
  if ($owed) $lines[] = '💰 Còn nợ công ngoài luồng: <b>' . number_format($owed, 0, ',', '.') . '₫</b>' . " ($owedN việc)";

  return $lines;
}

/* ---------------- bảng công việc ----------------
   Tách riêng khỏi bản tóm tắt để đẩy được vào đúng nhánh công việc của group,
   và vào giờ khác — bạn muốn xem việc lúc bắt đầu ngày làm, không phải lúc
   vừa ngủ dậy. Trả về mảng rỗng khi không có gì, để khỏi gửi tin trống. */
/* Mỗi loại tin đi vào một nhánh riêng của group: việc của mình, việc đã
   giao, nhắc lặp lại, và báo cáo. Trộn chung một nhánh thì đọc rất mệt —
   tin báo cáo dài đẩy trôi mất mấy lời nhắc ngắn.
   Chưa đặt nhánh nào thì lùi về cấu hình cũ (tg_work_topic) rồi tới nhánh
   mặc định, để bản cập nhật này không làm tin đang chạy đổi chỗ đột ngột. */
function topicFor(string $what) {
  static $map = ['tasks'  => 'tg_task_topic', 'cards'  => 'tg_card_topic',
                 'rem'    => 'tg_rem_topic',  'report' => 'tg_report_topic',
                 'ideas'  => 'tg_idea_topic'];
  if (!isset($map[$what])) return null;
  $v = trim((string)confGet($map[$what], ''));
  if ($v !== '') return $v;
  /* nhắc lặp lại và ý tưởng xưa nay đi nhánh mặc định, đừng kéo sang nhánh công việc */
  if ($what !== 'rem' && $what !== 'ideas') {
    $old = trim((string)confGet('tg_work_topic', ''));
    if ($old !== '') return $old;
  }
  return null;      // null = dùng nhánh mặc định
}

/* Dời nhắc: mốc mới ghi thẳng vào bản ghi ("YYYY-MM-DD HH:MM", giờ VN) nên
   web và Telegram luôn nhìn thấy cùng một thứ, không cần bảng riêng.
   Trả 0 khi không có mốc nào — dễ so sánh hơn null. */
function snoozeAt(array $t): int {
  $s = trim((string)($t['snoozeUntil'] ?? ''));
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/', $s, $m)) return 0;
  return mktime((int)$m[4], (int)$m[5], 0, (int)$m[2], (int)$m[3], (int)$m[1]);
}

function cutTitle($s, int $n = 60): string {
  $s = trim((string)$s);
  return mb_strlen($s, 'UTF-8') > $n ? mb_substr($s, 0, $n - 1, 'UTF-8') . '…' : $s;
}

function buildWork(): array {
  $today = date('Y-m-d');
  $lines = [];

  /* --- việc của mình --- */
  $late = []; $now = []; $soon = [];
  foreach (itemsOf('tasks') as $t) {
    if (!empty($t['done']) || taskSkippedPhp($t)) continue;
    $due = taskDayPhp($t);
    if (strlen($due) < 10) continue;
    if ($due < $today)      $late[] = $t;
    elseif ($due === $today) $now[] = $t;
    else {
      $d = (int)floor((strtotime($due) - strtotime($today)) / 86400);
      if ($d <= 3) $soon[] = [$t, $d];
    }
  }
  $mark = function ($t) {
    $p = ($t['prio'] ?? '') === 'high' ? ' ❗' : '';
    $at = taskAtPhp($t);
    return '   • ' . tgEsc(cutTitle($t['title'] ?? '')) . $p . ($at !== '' ? ' <i>(' . tgEsc($at) . ')</i>' : '');
  };

  if ($late) {
    usort($late, function ($a, $b) { return strcmp((string)$a['due'], (string)$b['due']); });
    $lines[] = '🔴 <b>Trễ hạn (' . count($late) . ')</b>';
    foreach (array_slice($late, 0, 8) as $t) {
      $d = (int)floor((strtotime($today) - strtotime(substr((string)$t['due'], 0, 10))) / 86400);
      $lines[] = $mark($t) . ' <i>— trễ ' . $d . ' ngày</i>';
    }
    if (count($late) > 8) $lines[] = '   … và ' . (count($late) - 8) . ' việc nữa';
  }
  if ($now) {
    $lines[] = ($lines ? "\n" : '') . '📌 <b>Hôm nay (' . count($now) . ')</b>';
    foreach (array_slice($now, 0, 10) as $t) $lines[] = $mark($t);
    if (count($now) > 10) $lines[] = '   … và ' . (count($now) - 10) . ' việc nữa';
  }
  if ($soon) {
    usort($soon, function ($a, $b) { return $a[1] - $b[1]; });
    $lines[] = ($lines ? "\n" : '') . '🗓 <b>Vài ngày tới</b>';
    foreach (array_slice($soon, 0, 5) as $s)
      $lines[] = '   • ' . tgEsc(cutTitle($s[0]['title'] ?? '')) . ' <i>— còn ' . $s[1] . ' ngày</i>';
  }

  /* --- việc đã giao cho người khác --- */
  $cLate = []; $cToday = [];
  foreach (itemsOf('cards') as $c) {
    if ((string)($c['col'] ?? '') === 'done') continue;
    $due = substr((string)($c['due'] ?? ''), 0, 10);
    if (strlen($due) < 10) continue;
    if ($due < $today)       $cLate[] = $c;
    elseif ($due === $today) $cToday[] = $c;
  }
  $who = function ($c) {
    $a = trim((string)($c['assignee'] ?? ''));
    $p = ($c['prio'] ?? '') === 'high' ? ' ❗' : '';
    $at = (string)($c['remindAt'] ?? '');
    return '   • ' . tgEsc(cutTitle($c['title'] ?? '')) . $p
         . ($a !== '' ? ' — <b>' . tgEsc($a) . '</b>' : ' — <i>chưa giao</i>')
         . ($at !== '' ? ' <i>(' . tgEsc($at) . ')</i>' : '');
  };
  if ($cLate || $cToday) {
    $lines[] = ($lines ? "\n" : '') . '👥 <b>Việc đã giao</b>';
    foreach (array_slice($cLate, 0, 6) as $c) {
      $d = (int)floor((strtotime($today) - strtotime(substr((string)$c['due'], 0, 10))) / 86400);
      $lines[] = $who($c) . ' <i>(trễ ' . $d . ' ngày)</i>';
    }
    foreach (array_slice($cToday, 0, 6) as $c) $lines[] = $who($c) . ' <i>(hạn hôm nay)</i>';
  }

  return $lines;
}

/* ---------------- tóm tắt cuối tuần ----------------
   Gửi một lần vào Chủ nhật — bản song sinh của màn "Ôn lại tuần" trong
   app, chỉ gọn hơn vì đây là tin nhắn chứ không phải một trang để cuộn. */
function tierPing(string $tier): int {
  static $p = ['S' => 14, 'S2' => 21, 'A' => 30, 'B' => 60, 'C' => 150];
  return $p[$tier] ?? 60;
}

/* Nhìn lại một tháng. Gửi đúng ngày cuối tháng, vào giờ nhắc cuối ngày —
   lúc đó ngày coi như đã xong nên con số không còn chạy nữa.
   Bản song sinh của monthReview() trong js/state.js. */
function buildMonth(?int $now = null): array {
  $now = $now ?? time();
  $ym    = date('Y-m', $now);
  $lines = [];

  $doneN = 0;
  foreach (itemsOf('tasks') as $t) {
    if (!empty($t['repeat'])) {
      foreach ((array)($t['doneLog'] ?? []) as $d)
        if (substr((string)$d, 0, 7) === $ym) $doneN++;
    } elseif (!empty($t['done']) && substr((string)($t['doneAt'] ?? ''), 0, 7) === $ym) $doneN++;
  }
  $cardsDone = 0;
  foreach (itemsOf('cards') as $c)
    if ((string)($c['col'] ?? '') === 'done'
        && substr((string)($c['doneAt'] ?? ''), 0, 7) === $ym) $cardsDone++;

  /* chỉ có ngày dời gần nhất chứ không có lịch sử từng lần — nhãn nói đúng vậy */
  $pushed = [];
  foreach (itemsOf('tasks') as $t)
    if (substr((string)($t['pushedAt'] ?? ''), 0, 7) === $ym) $pushed[] = $t;
  usort($pushed, fn($a, $b) => (int)($b['pushes'] ?? 0) <=> (int)($a['pushes'] ?? 0));

  $ducked = 0;
  foreach (itemsOf('tasks') as $t)
    if (empty($t['done']) && (int)($t['pushes'] ?? 0) >= 3) $ducked++;

  $touched = 0; $people = 0; $forgot = 0;
  foreach (itemsOf('people') as $p) {
    $people++;
    if (substr((string)($p['lastContact'] ?? ''), 0, 7) === $ym) $touched++;
    $gap  = !empty($p['lastContact'])
      ? (int)floor((strtotime(date('Y-m-d', $now)) - strtotime((string)$p['lastContact'])) / 86400)
      : 9999;
    if ($gap - tierPing((string)($p['tier'] ?? '')) > 0) $forgot++;
  }

  $loi = 0; $hoc = 0; $causes = []; $lessons = [];
  foreach (itemsOf('journey') as $o) {
    if (substr((string)($o['date'] ?? ''), 0, 7) !== $ym) continue;
    if ((string)($o['kind'] ?? '') === 'loi') $loi++; else $hoc++;
    foreach ((array)($o['causes'] ?? []) as $c) {
      $c = trim((string)$c);
      if ($c !== '') $causes[$c] = ($causes[$c] ?? 0) + 1;
    }
    $ls = trim((string)($o['lesson'] ?? ''));
    if ($ls !== '' && count($lessons) < 3) $lessons[] = $ls;
  }
  arsort($causes);

  $lines[] = '📅 <b>Nhìn lại tháng ' . (int)substr($ym, 5, 2) . '/' . substr($ym, 0, 4) . '</b>';
  $lines[] = '';
  $lines[] = '✓ <b>' . $doneN . '</b> việc xong · 📇 <b>' . $cardsDone . '</b> thẻ giao xong';
  $lines[] = '☎️ <b>' . $touched . '/' . $people . '</b> người đã hỏi thăm'
           . ($forgot ? ' · <b>' . $forgot . '</b> người quá chu kỳ' : '');
  if ($pushed) {
    $top = $pushed[0];
    $lines[] = '🔁 <b>' . count($pushed) . '</b> việc bị dời — nhiều nhất: '
             . tgEsc(cutTitle($top['title'] ?? '')) . ' (' . (int)($top['pushes'] ?? 0) . ' lần)';
  }
  if ($ducked) $lines[] = '🙈 Còn <b>' . $ducked . '</b> việc đang bị né — chia nhỏ, giao đi, hay bỏ hẳn';

  if ($loi + $hoc > 0) {
    $lines[] = '';
    $lines[] = '─────────────';
    $lines[] = '';
    $lines[] = '🌱 Ghi được <b>' . $loi . '</b> lỗi lầm và <b>' . $hoc . '</b> bài học';
    if ($causes) {
      $tx = [];
      foreach (array_slice($causes, 0, 4, true) as $c => $n) $tx[] = tgEsc($c) . ' ×' . $n;
      $lines[] = '   ⟲ Gốc hay gặp: ' . implode(' · ', $tx);
    }
    foreach ($lessons as $ls) $lines[] = '   • <i>' . tgEsc(cutTitle($ls)) . '</i>';
  }
  return $lines;
}

function buildWeekly(): array {
  $today = date('Y-m-d');
  $from  = date('Y-m-d', strtotime('-7 day'));
  $lines = [];

  /* việc lặp lại không bao giờ ở trạng thái "done", nên đếm theo lịch sử hoàn thành */
  $doneCount = 0;
  foreach (itemsOf('tasks') as $t) {
    if (!empty($t['repeat'])) {
      foreach ((array)($t['doneLog'] ?? []) as $d) if ((string)$d >= $from) $doneCount++;
    } elseif (!empty($t['done']) && (string)($t['doneAt'] ?? '') >= $from) $doneCount++;
  }
  $cardsDone = 0;
  foreach (itemsOf('cards') as $c)
    if ((string)($c['col'] ?? '') === 'done' && (string)($c['doneAt'] ?? '') >= $from) $cardsDone++;

  $lateTasks = [];
  foreach (itemsOf('tasks') as $t)
    if (empty($t['done']) && !empty($t['due']) && !taskSkippedPhp($t)
        && taskDayPhp($t) < $today) $lateTasks[] = $t;

  $touched = 0;
  foreach (itemsOf('people') as $p)
    if (!empty($p['lastContact']) && (string)$p['lastContact'] >= $from) $touched++;

  $lines[] = "✓ <b>$doneCount</b> việc xong";
  $lines[] = "📇 <b>$cardsDone</b> thẻ giao xong";
  $lines[] = "☎️ <b>$touched</b> người đã hỏi thăm";

  /* mỗi khối cách nhau một vạch ngang, dễ nhìn hơn để trống suông —
     tin nhiều mục dồn lại một chỗ nhìn rất rối trên điện thoại */
  $sep = function () use (&$lines) { $lines[] = ''; $lines[] = '─────────────'; $lines[] = ''; };

  if ($lateTasks) {
    $sep();
    $lines[] = '⚠️ <b>Đang trễ — dời hay bỏ? (' . count($lateTasks) . ')</b>';
    foreach (array_slice($lateTasks, 0, 6) as $t) $lines[] = '   • ' . tgEsc(cutTitle($t['title'] ?? ''));
    if (count($lateTasks) > 6) $lines[] = '   … và ' . (count($lateTasks) - 6) . ' việc nữa';
  }

  /* Việc đã dời từ ba lần trở lên. Tách khỏi khối "đang trễ" ở trên: trễ là
     chưa kịp làm, còn dời ba lần là đang né — và cách xử hai thứ đó khác nhau. */
  $ducked = [];
  foreach (itemsOf('tasks') as $t)
    if (empty($t['done']) && (int)($t['pushes'] ?? 0) >= 3) $ducked[] = $t;
  if ($ducked) {
    usort($ducked, fn($a, $b) => (int)($b['pushes'] ?? 0) <=> (int)($a['pushes'] ?? 0));
    $sep();
    $lines[] = '🔁 <b>Đang bị né — chia nhỏ, giao đi, hay bỏ hẳn? (' . count($ducked) . ')</b>';
    foreach (array_slice($ducked, 0, 5) as $t)
      $lines[] = '   • ' . tgEsc(cutTitle($t['title'] ?? ''))
               . ' — <i>đã dời ' . (int)($t['pushes'] ?? 0) . ' lần</i>';
    if (count($ducked) > 5) $lines[] = '   … và ' . (count($ducked) - 5) . ' việc nữa';
  }

  /* người lâu chưa hỏi thăm, theo mức thân sơ riêng của từng người */
  $forgotten = [];
  foreach (itemsOf('people') as $p) {
    $gap = !empty($p['lastContact']) ? (int)floor((strtotime($today) - strtotime((string)$p['lastContact'])) / 86400) : 9999;
    $over = $gap - tierPing((string)($p['tier'] ?? 'B'));
    if ($over > 0) $forgotten[] = [$p, $over];
  }
  if ($forgotten) {
    usort($forgotten, function ($a, $b) { return $b[1] - $a[1]; });
    $sep();
    $lines[] = '🙈 <b>Lâu rồi chưa hỏi thăm</b>';
    foreach (array_slice($forgotten, 0, 5) as $f)
      $lines[] = '   • ' . tgEsc((string)($f[0]['name'] ?? '')) . ' — trễ ' . $f[1] . ' ngày';
  }

  $owed = 0; $owedN = 0;
  foreach (itemsOf('cards') as $c)
    if (!empty($c['extra']) && empty($c['extraPaidDate'])) { $owed += (int)($c['extraPay'] ?? 0); $owedN++; }
  if ($owed) {
    $sep();
    $lines[] = '💰 Còn nợ công ngoài luồng: <b>' . number_format($owed, 0, ',', '.') . '₫</b>' . " ($owedN việc)";
  }

  return $lines;
}

/* ---------------- tổng kết tuần theo từng nhân sự ----------------
   Mỗi người một tin riêng, cố ý: để bạn chuyển tiếp thẳng cho họ mà không
   phải cắt dán, và không lộ số liệu của người này sang người kia.
   Trả về [['name' => ..., 'lines' => [...]], ...], bỏ qua ai không có gì. */
function buildStaffWeekly(): array {
  $today = date('Y-m-d');
  $from  = date('Y-m-d', strtotime('-7 day'));
  $blank = ['new' => 0, 'done' => 0, 'open' => 0, 'late' => [], 'owed' => 0, 'owedN' => 0];
  $by = [];

  foreach (itemsOf('cards') as $c) {
    $who = trim((string)($c['assignee'] ?? ''));
    if ($who === '') continue;
    if (!isset($by[$who])) $by[$who] = $blank;

    if (substr((string)($c['createdAt'] ?? ''), 0, 10) >= $from) $by[$who]['new']++;

    $isDone = (string)($c['col'] ?? '') === 'done';
    if ($isDone) {
      if (substr((string)($c['doneAt'] ?? ''), 0, 10) >= $from) $by[$who]['done']++;
    } else {
      $by[$who]['open']++;
      $due = substr((string)($c['due'] ?? ''), 0, 10);
      if (strlen($due) === 10 && $due < $today)
        $by[$who]['late'][] = [$c, (int)floor((strtotime($today) - strtotime($due)) / 86400)];
    }
    /* tiền công ngoài luồng tính cả việc đã xong — nợ vẫn là nợ */
    if (!empty($c['extra']) && empty($c['extraPaidDate'])) {
      $by[$who]['owed'] += (int)($c['extraPay'] ?? 0);
      $by[$who]['owedN']++;
    }
  }

  ksort($by, SORT_NATURAL | SORT_FLAG_CASE);
  $out = [];
  foreach ($by as $name => $r) {
    if ($r['new'] === 0 && $r['done'] === 0 && $r['open'] === 0 && $r['owed'] === 0) continue;
    $lines = [];
    $lines[] = '📥 <b>' . $r['new'] . '</b> việc mới giao trong tuần';
    $lines[] = '✓ <b>' . $r['done'] . '</b> việc đã xong';
    $lines[] = '📋 <b>' . $r['open'] . '</b> việc còn đang mở';

    if ($r['late']) {
      usort($r['late'], function ($a, $b) { return $b[1] - $a[1]; });
      $lines[] = '';
      $lines[] = '─────────────';
      $lines[] = '';
      $lines[] = '🔴 <b>Đang trễ (' . count($r['late']) . ')</b>';
      foreach (array_slice($r['late'], 0, 6) as $l)
        $lines[] = '   • ' . tgEsc(cutTitle($l[0]['title'] ?? '')) . ' <i>— trễ ' . $l[1] . ' ngày</i>';
      if (count($r['late']) > 6) $lines[] = '   … và ' . (count($r['late']) - 6) . ' việc nữa';
    }
    if ($r['owed']) {
      $lines[] = '';
      $lines[] = '─────────────';
      $lines[] = '';
      $lines[] = '💰 Tiền công ngoài luồng chưa trả: <b>'
               . number_format($r['owed'], 0, ',', '.') . '₫</b> (' . $r['owedN'] . ' việc)';
    }
    $out[] = ['name' => (string)$name, 'lines' => $lines];
  }
  return $out;
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

/* ---- nhớ tin đã gửi, để sau còn gỡ nút xuống ----
   Tick xong trong app mà tin trên Telegram vẫn còn nguyên nút "Xong" thì
   lần sau mở điện thoại ra sẽ bấm lại — bấm vào chỗ đã xong từ lâu. Nên mỗi
   tin có nút đều nhớ lại message_id cùng nội dung của nó; tick ở đâu cũng
   được, máy chủ sửa lại đúng tin đó và bỏ nút đi.
   Khoá cố ý KHÔNG mang giờ: trong ngày gửi lại mấy lần thì tin mới đè lên
   tin cũ, và tin mới nhất mới là tin đang nằm trên màn hình. */
function tgMsgKey(string $kind, string $id, ?string $day = null): string {
  return $kind . ':' . $id . ':' . ($day ?? date('Y-m-d'));
}
function tgRemember(string $key, array $res, string $text): void {
  $id = $res['result']['message_id'] ?? null;
  if (empty($res['ok']) || !$id) return;
  db()->prepare('INSERT OR REPLACE INTO tgmsg (k, msg, txt, at) VALUES (?,?,?,?)')
      ->execute([$key, (int)$id, $text, time()]);
  db()->prepare('DELETE FROM tgmsg WHERE at < ?')->execute([time() - 30 * 86400]);
}
function tgForget(string $key): void {
  db()->prepare('DELETE FROM tgmsg WHERE k = ?')->execute([$key]);
}
/* Sửa tin cũ: thêm dòng kết vào cuối và bỏ bộ nút (không gửi kèm
   reply_markup là Telegram gỡ nút xuống). Quên khoá ngay từ đầu, để hai
   lần tick sát nhau không bắn hai lệnh sửa giống hệt lên Telegram. */
function tgSettle(string $key, string $note): bool {
  $token = (string)confGet('tg_token', '');
  if ($token === '') return false;
  $st = db()->prepare('SELECT msg, txt FROM tgmsg WHERE k = ?');
  $st->execute([$key]);
  $row = $st->fetch();
  if (!$row || empty($row['msg'])) return false;
  tgForget($key);
  /* Chờ ngắn thôi: lượt đồng bộ của app đang đợi ở đầu kia, mà gỡ nút chỉ
     là chuyện làm đẹp — hỏng thì lần bấm sau webhook vẫn sửa được. */
  $res = httpPostJson("https://api.telegram.org/bot$token/editMessageText", [
    'chat_id'    => (string)confGet('tg_chat', ''),
    'message_id' => (int)$row['msg'],
    'parse_mode' => 'HTML',
    'text'       => (string)$row['txt'] . "\n\n" . $note,
  ], 6);
  return !empty($res['ok']);
}
/* Việc/lời nhắc này đã xong hôm nay chưa — dùng chung cho cả hai chiều:
   webhook bấm nút, và app đẩy bản ghi lên. */
function tgSettleDone(string $kind, string $id, string $note): bool {
  return tgSettle(tgMsgKey($kind, $id), $note);
}

/* ---------------- vì sao lời nhắc chưa chạy ----------------
   Trả lời thẳng cho từng đầu việc có hẹn giờ, thay vì để người dùng
   đoán mò giữa: máy chủ chưa có dữ liệu, sai ngày hạn, chưa tới giờ,
   đã gửi rồi, hay cron không chạy. Chỉ đọc, không gửi gì. */
function tgWhy(): array {
  $now = time();
  $today = date('Y-m-d');
  $items = [];

  foreach ([['tasks', 'Việc'], ['cards', 'Thẻ giao việc']] as $spec) {
    list($kind, $label) = $spec;
    foreach (itemsOf($kind) as $t) {
      $at = trim(taskAtPhp($t));
      $sn = trim((string)($t['snoozeUntil'] ?? ''));
      if ($at === '' && $sn === '') continue;
      $due = taskDayPhp($t);
      $row = ['kind' => $label, 'title' => (string)($t['title'] ?? ''),
              'at' => $at, 'due' => $due, 'snooze' => $sn, 'ok' => false];

      /* Mốc dời đè lên giờ hẹn thường — trừ khi nó đã trôi qua từ hôm
         trước, lúc đó giờ hẹn hằng ngày lại có hiệu lực trở lại. */
      $useSnooze = $sn !== '' && (substr($sn, 0, 10) >= $today || $at === '');

      if ($kind === 'tasks' ? !empty($t['done']) : (string)($t['col'] ?? '') === 'done')
        $row['why'] = 'Đã đánh dấu xong — không nhắc nữa';
      elseif ($useSnooze) {
        $when = snoozeAt($t);
        $key  = 'snz:' . $kind . ':' . ($t['id'] ?? '?') . ':' . $sn;
        if ($when === 0)                     $row['why'] = 'Mốc dời không hợp lệ';
        elseif (alreadySent($key))           $row['why'] = 'Đã gửi lời nhắc dời rồi';
        elseif ($now < $when)                $row['why'] = 'Đã dời — còn ' . (int)ceil(($when - $now) / 60) . ' phút';
        elseif ($now - $when > REM_WINDOW)   $row['why'] = 'Quá 1 tiếng so với mốc dời — bỏ lần này';
        else { $row['why'] = 'Sẽ gửi ở lần cron kế tiếp'; $row['ok'] = true; }
      }
      elseif (!preg_match('/^(\d{1,2}):(\d{2})$/', $at, $m))
        $row['why'] = 'Giờ hẹn không hợp lệ';
      elseif ($due === '')
        $row['why'] = 'Chưa đặt hạn — chỉ nhắc đúng ngày hạn';
      elseif ($due !== $today
              && !((int)($t['remindBefore'] ?? 0) > 0
                   && $due === date('Y-m-d', strtotime('+' . (int)$t['remindBefore'] . ' day'))))
        $row['why'] = 'Hạn ' . $due . ', hôm nay không phải ngày nhắc';
      else {
        $when = mktime((int)$m[1], (int)$m[2], 0, (int)date('n'), (int)date('j'), (int)date('Y'));
        $key  = 'item:' . $kind . ':' . ($t['id'] ?? '?') . ':' . $today . ':' . $at;
        if (alreadySent($key))
          $row['why'] = 'Đã gửi rồi';
        elseif ($now < $when)
          $row['why'] = 'Chưa tới giờ — còn ' . (int)ceil(($when - $now) / 60) . ' phút';
        elseif ($now - $when > REM_WINDOW)
          $row['why'] = 'Quá 1 tiếng so với giờ hẹn — bỏ lần này';
        else { $row['why'] = 'Sẽ gửi ở lần cron kế tiếp'; $row['ok'] = true; }
      }
      $items[] = $row;
    }
  }

  $lastCron = confGet('last_cron', '');
  return [
    'now'       => date('H:i:s d/m/Y'),
    'lastCron'  => $lastCron === '' ? null : (int)((time() - (int)$lastCron) / 60),
    'enabled'   => (bool)confGet('tg_enabled', ''),
    'hasToken'  => confGet('tg_token', '') !== '',
    'hasChat'   => confGet('tg_chat', '') !== '',
    'items'     => $items,
  ];
}

function runSchedule(bool $dry = false): array {
  $done = [];
  /* Ghi mốc trước mọi thứ khác: câu hỏi hay gặp nhất khi tin không tới
     là "cron có thật sự chạy không", phải trả lời được kể cả khi
     Telegram đang tắt hoặc không có gì để gửi. */
  if (!$dry) confSet('last_cron', (string)time());
  if (!confGet('tg_enabled')) return ['skipped' => 'Telegram đang tắt'];

  $now   = time();
  $today = date('Y-m-d');
  $wday  = (int)date('w', $now);       // 0 = Chủ nhật, giống JavaScript

  /* --- lời nhắc lặp lại --- */
  foreach (itemsOf('reminders') as $r) {
    if (empty($r['enabled'])) continue;
    /* Giờ đã áp mốc dời riêng của hôm nay; null = hôm nay không có lần nào */
    $time = (string)remTimeOnPhp($r, $today);
    if (!preg_match('/^(\d{1,2}):(\d{2})$/', $time, $m)) continue;
    $at = mktime((int)$m[1], (int)$m[2], 0, (int)date('n'), (int)date('j'), (int)date('Y'));

    /* Chưa tới giờ thì chờ. Trễ quá cửa sổ cho phép thì bỏ luôn —
       nhắc "tập gym 18:30" vào lúc 22h thì chỉ gây khó chịu. */
    if ($now < $at || $now - $at > REM_WINDOW) continue;

    $key = 'rem:' . ($r['id'] ?? '?') . ':' . $today;
    if (alreadySent($key)) continue;
    /* Đã tick xong hôm nay rồi thì đừng nhắc nữa — tập gym xong lúc 6h
       sáng mà 18h30 vẫn bị nhắc thì lần sau người ta tắt luôn cái app. */
    if (in_array($today, array_map('strval', (array)($r['doneLog'] ?? [])), true)) continue;

    if ($dry) { $done[] = ['reminder' => $r['title'] ?? '', 'dry' => true]; continue; }
    $rText = remText($r);
    $res = tgSend($rText, remTopic($r), tgRemButtons((string)($r['id'] ?? '')));
    if (!empty($res['ok'])) {
      markSent($key);
      tgRemember(tgMsgKey('rem', (string)($r['id'] ?? '?'), $today), $res, $rText);
    }
    $done[] = ['reminder' => $r['title'] ?? '', 'ok' => !empty($res['ok']),
               'error' => $res['error'] ?? null];
  }

  /* --- nhắc riêng từng đầu việc: đúng ngày hạn, và trước hạn nếu có đặt --- */
  foreach ([['tasks', '✓', 'việc của mình'], ['cards', '👥', 'việc đã giao']] as $spec) {
    list($kind, $icon, $what) = $spec;
    foreach (itemsOf($kind) as $t) {
      $at = taskAtPhp($t);
      if (!preg_match('/^(\d{1,2}):(\d{2})$/', $at, $m)) continue;
      if ($kind === 'tasks' ? !empty($t['done']) : (string)($t['col'] ?? '') === 'done') continue;
      if (taskSkippedPhp($t)) continue;

      /* Hai ngày được nhắc: đúng ngày hạn, và ngày "còn N hôm nữa" nếu có
         đặt nhắc trước. Chỉ một tin báo trước chứ không nhắc suốt N ngày —
         việc lớn cần một cú hích sớm, không cần bị càu nhàu mỗi sáng. */
      $due = taskDayPhp($t);
      if (strlen($due) < 10) continue;
      $before = (int)($t['remindBefore'] ?? 0);
      if ($due === $today)                                                      $lead = 0;
      elseif ($before > 0 && $due === date('Y-m-d', strtotime("+$before day"))) $lead = $before;
      else continue;

      /* Đã bấm dời trong hôm nay thì thôi, khỏi nhắc theo giờ hẹn nữa —
         người ta vừa nói "để lát nữa", nhắc lại đúng giờ cũ là vô nghĩa. */
      $sn = substr(trim((string)($t['snoozeUntil'] ?? '')), 0, 10);
      if ($sn !== '' && $sn >= $today) continue;

      $when = mktime((int)$m[1], (int)$m[2], 0, (int)date('n'), (int)date('j'), (int)date('Y'));
      if ($now < $when || $now - $when > REM_WINDOW) continue;

      /* Giờ hẹn nằm trong khoá: đổi giờ nhắc của cùng một việc trong
         cùng một ngày phải được coi là lời nhắc mới. Trước đây khoá chỉ
         có ngày, nên đặt 23:20 rồi sửa thành 23:25 là lần sau bị chặn
         im lặng tới hết ngày — đúng thao tác người ta hay làm khi thử. */
      $key = 'item:' . $kind . ':' . ($t['id'] ?? '?') . ':' . $today . ':' . $at;
      if (alreadySent($key)) continue;

      $extra = $kind === 'cards' && trim((string)($t['assignee'] ?? '')) !== ''
             ? "\nGiao cho <b>" . tgEsc((string)$t['assignee']) . '</b>' : '';
      $note = trim((string)($t['note'] ?? $t['desc'] ?? ''));
      /* Chỉ ghi thời lượng khi mình có điền thật — số tạm 30 phút là để xếp
         trục cho gọn, đưa vào tin nhắn thì thành ra máy tự bịa. */
      $est = $kind === 'tasks' ? (int)round((float)($t['mins'] ?? 0)) : 0;
      $dur = $est > 0 ? ' · ' . durText(min($est, 720)) : '';
      $head = $lead === 0 ? 'Hạn hôm nay · ' . $at . $dur
            : 'Còn ' . $lead . ' ngày — hạn ' . date('d/m', strtotime($due)) . ' · ' . $at . $dur;
      $text = ($lead === 0 ? $icon : '⏳') . ' <b>' . tgEsc((string)($t['title'] ?? 'Việc cần làm')) . '</b>'
            . "\n<i>" . $head . '</i>' . $extra
            . ($note !== '' ? "\n\n" . tgEsc(cutTitle($note, 300)) : '');

      if ($dry) { $done[] = [$what => $t['title'] ?? '', 'dry' => true]; continue; }
      $res = tgSend($text, topicFor($kind), tgItemButtons($kind, (string)($t['id'] ?? '')));
      if (!empty($res['ok'])) {
        markSent($key);
        tgRemember(tgMsgKey($kind, (string)($t['id'] ?? '?'), $today), $res, $text);
      }
      $done[] = [$what => $t['title'] ?? '', 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
    }
  }

  /* --- việc đã bấm dời lại ---
     Chạy độc lập với ngày hạn: dời rồi thì nhắc đúng mốc mới, kể cả khi
     mốc đó rơi sang tuần sau hay việc vốn không có hạn nào. Khoá chống
     trùng mang theo mốc, nên dời tiếp lần nữa vẫn được nhắc tiếp. */
  foreach ([['tasks', '✓', 'dời · việc của mình'], ['cards', '👥', 'dời · việc đã giao']] as $spec) {
    list($kind, $icon, $what) = $spec;
    foreach (itemsOf($kind) as $t) {
      if ($kind === 'tasks' ? !empty($t['done']) : (string)($t['col'] ?? '') === 'done') continue;
      $when = snoozeAt($t);
      if ($when === 0 || $now < $when || $now - $when > REM_WINDOW) continue;

      $key = 'snz:' . $kind . ':' . ($t['id'] ?? '?') . ':' . trim((string)$t['snoozeUntil']);
      if (alreadySent($key)) continue;

      $extra = $kind === 'cards' && trim((string)($t['assignee'] ?? '')) !== ''
             ? "\nGiao cho <b>" . tgEsc((string)$t['assignee']) . '</b>' : '';
      $due  = substr((string)($t['due'] ?? ''), 0, 10);
      $text = $icon . ' <b>' . tgEsc((string)($t['title'] ?? 'Việc cần làm')) . '</b>'
            . "\n<i>Nhắc lại theo lời hẹn dời</i>" . $extra
            . ($due !== '' ? "\n<i>Hạn " . date('d/m', strtotime($due)) . '</i>' : '');

      if ($dry) { $done[] = [$what => $t['title'] ?? '', 'dry' => true]; continue; }
      $res = tgSend($text, topicFor($kind), tgItemButtons($kind, (string)($t['id'] ?? '')));
      if (!empty($res['ok'])) {
        markSent($key);
        tgRemember(tgMsgKey($kind, (string)($t['id'] ?? '?'), $today), $res, $text);
      }
      $done[] = [$what => $t['title'] ?? '', 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
    }
  }

  /* --- sắp hết ngày: còn việc nào chưa tick ---
     Cột "quá giờ" trong app chỉ thấy khi mở app; cái này tới tận tay lúc
     còn kịp làm. Xong hết thì im — tin nhắc mà ngày nào cũng có, kể cả
     ngày mình làm trọn vẹn, thì chỉ vài hôm là bị tắt. */
  $eh = confGet('tg_endday_hour', '22');
  if ($eh !== null && (int)$eh >= 0 && (int)date('G', $now) >= (int)$eh
      && !alreadySent('endday:' . $today)) {
    $slots = todaySlots();
    /* Lịch của app khác thì bỏ ra khỏi danh sách nhắc: nó không tick được ở
       đây nên nhắc cũng chẳng làm được gì, chỉ tổ đẩy con số "còn N việc"
       phồng lên. Vẫn giữ trong $slots để nó chiếm giờ ở phần "còn trống" —
       giờ đó bận thật, chỉ là bận ở app bên kia. */
    $left  = [];
    foreach ($slots as $x) if (empty($x['done']) && empty($x['feed'])) $left[] = $x;
    $leftUn = [];
    foreach (todayUnsched() as $x) if (empty($x['done'])) $leftUn[] = $x;

    if ($left || $leftUn) {
      $w   = workWin();
      $nm  = (int)date('G', $now) * 60 + (int)date('i', $now);
      $rest = 0;
      foreach ($left as $x)   $rest += $x['mins'];
      foreach ($leftUn as $x) $rest += $x['mins'];

      $edl = ['🌙 <b>Sắp hết ngày — còn ' . (count($left) + count($leftUn))
                . ' việc · ' . durText($rest) . '</b>'];
      foreach (array_slice($left, 0, 8) as $x)
        $edl[] = '   • ' . hhmmText($x['start']) . ' ' . tgEsc($x['title'])
                 . ' · ' . (empty($x['est']) ? '~' : '') . durText($x['mins']);
      foreach (array_slice($leftUn, 0, 4) as $x)
        $edl[] = '   • ' . tgEsc($x['title']) . ' · ' . (empty($x['est']) ? '~' : '')
                 . durText($x['mins']) . ' <i>(chưa xếp giờ)</i>';

      /* Còn trống bao nhiêu tính từ bây giờ tới hết cửa sổ, đã trừ phần
         việc đã xếp giờ mà chưa làm — đó mới là chỗ thật sự còn nhét được. */
      if (empty($w['off']) && $w['to'] > $nm) {
        $busyAhead = 0;
        foreach (slotBusy($slots) as $sp)
          $busyAhead += max(0, min($sp[1], $w['to']) - max($sp[0], $nm));
        $edl[] = 'Còn trống ' . durText(max(0, ($w['to'] - $nm) - $busyAhead))
                 . ' tới ' . winText($w['to']) . '.';
      }
      $text = implode("\n", $edl);

      if ($dry) { $done[] = ['endday' => count($left) + count($leftUn), 'dry' => true, 'sent' => $text]; }
      else {
        $res = tgSend($text, topicFor('report'));
        if (!empty($res['ok'])) markSent('endday:' . $today);
        $done[] = ['endday' => count($left) + count($leftUn), 'ok' => !empty($res['ok']),
                   'error' => $res['error'] ?? null];
      }
    }
  }

  /* Nhìn lại tháng — đúng ngày cuối tháng, cùng giờ với tin cuối ngày. Gửi
     ngày mùng 1 thì đúng hơn về mặt số liệu, nhưng "nhìn lại" mà tới lúc
     đang bận bắt đầu tháng mới mới đọc thì chẳng ai đọc. */
  $ym = date('Y-m', $now);
  if ($eh !== null && (int)$eh >= 0 && (int)date('G', $now) >= (int)$eh
      && date('Y-m-d', $now) === date('Y-m-t', $now) && !alreadySent('month:' . $ym)) {
    $ml = buildMonth($now);
    if (count($ml) > 1) {
      $text = implode("\n", $ml);
      if ($dry) { $done[] = ['month' => $ym, 'dry' => true, 'sent' => $text]; }
      else {
        $res = tgSend($text, topicFor('report'));
        if (!empty($res['ok'])) markSent('month:' . $ym);
        $done[] = ['month' => $ym, 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
      }
    }
  }

  /* --- ý tưởng tới hẹn xem lại ---
     Ý tưởng không có hạn nên nó chìm; đây là cú hích duy nhất bắt mình
     phải quyết. Bắn một lần cho mỗi ý tưởng ở mỗi mốc hẹn: khoá mang
     theo ngày hẹn, nên bấm "nhắc lại sau 3 tháng" xong vẫn được hỏi
     tiếp ở mốc mới. Trễ mấy ngày vẫn gửi (không như lời nhắc theo giờ)
     — một câu hỏi "làm hay bỏ" thì muộn vài hôm vẫn còn nguyên giá trị. */
  $ih = confGet('tg_idea_hour', '9');
  if ($ih !== null && (int)$ih >= 0 && (int)date('G', $now) >= (int)$ih) {
    foreach (itemsOf('ideas') as $i) {
      $st = (string)($i['status'] ?? '');
      if ($st === 'done' || $st === 'drop') continue;
      $rv = substr((string)($i['reviewAt'] ?? ''), 0, 10);
      if (strlen($rv) !== 10 || $rv > $today) continue;

      $key = 'idea:' . ($i['id'] ?? '?') . ':' . $rv;
      if (alreadySent($key)) continue;

      $late = (int)floor((strtotime($today) - strtotime($rv)) / 86400);
      $text = '💡 <b>' . tgEsc((string)($i['title'] ?? 'Ý tưởng')) . '</b>'
            . "\n<i>Tới hẹn xem lại" . ($late > 0 ? ' — hẹn từ ' . date('d/m', strtotime($rv)) : '') . '</i>'
            . (!empty($i['detail']) ? "\n\n" . tgEsc(cutTitle((string)$i['detail'], 300)) : '')
            . (!empty($i['plan']) ? "\n\n<b>Hướng triển khai</b>\n"
                                    . tgEsc(cutTitle((string)$i['plan'], 300)) : '')
            . "\n\nLàm hay bỏ?";

      if ($dry) { $done[] = ['idea' => $i['title'] ?? '', 'dry' => true]; continue; }
      $res = tgSend($text, topicFor('ideas'), tgIdeaButtons((string)($i['id'] ?? '')));
      if (!empty($res['ok'])) markSent($key);
      $done[] = ['idea' => $i['title'] ?? '', 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
    }
  }

  /* --- báo trễ leo thang: chỉ bắn đúng một lần ở mỗi mốc ngày trễ,
     không nhắc lại mỗi ngày — việc đã có trong bảng công việc rồi. --- */
  if (confGet('tg_escalate')) {
    foreach ([['tasks', 'việc của mình'], ['cards', 'việc đã giao']] as $spec) {
      list($kind, $what) = $spec;
      foreach (itemsOf($kind) as $t) {
        if ($kind === 'tasks' ? !empty($t['done']) : (string)($t['col'] ?? '') === 'done') continue;
        if (taskSkippedPhp($t)) continue;
        $due = taskDayPhp($t);
        if (strlen($due) < 10) continue;
        $daysLate = (int)floor((strtotime($today) - strtotime($due)) / 86400);
        if (!in_array($daysLate, ESCALATE_DAYS, true)) continue;

        $key = 'esc:' . $kind . ':' . ($t['id'] ?? '?') . ':' . $daysLate;
        if (alreadySent($key)) continue;

        $who = $kind === 'cards' && trim((string)($t['assignee'] ?? '')) !== ''
             ? ' — <b>' . tgEsc((string)$t['assignee']) . '</b>' : '';
        $text = '🆘 <b>Trễ ' . $daysLate . ' ngày:</b> ' . tgEsc(cutTitle($t['title'] ?? '')) . $who;

        if ($dry) { $done[] = ['escalate' => $t['title'] ?? '', 'days' => $daysLate, 'dry' => true]; continue; }
        $res = tgSend($text, topicFor($kind), tgItemButtons($kind, (string)($t['id'] ?? '')));
        if (!empty($res['ok'])) {
          markSent($key);
          tgRemember(tgMsgKey($kind, (string)($t['id'] ?? '?'), $today), $res, $text);
        }
        $done[] = ['escalate' => $t['title'] ?? '', 'days' => $daysLate, 'ok' => !empty($res['ok']),
                   'error' => $res['error'] ?? null];
      }
    }
  }

  /* --- tóm tắt cuối tuần: chỉ Chủ nhật --- */
  $weekH = confGet('tg_weekly_hour', '-1');
  if ($wday === 0 && $weekH !== null && (int)$weekH >= 0 && (int)date('G', $now) >= (int)$weekH) {
    $key = 'weekly:' . $today;
    if (!alreadySent($key)) {
      $lines = buildWeekly();
      $text = '📅 <b>Tuần này · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines);
      if ($dry) { $done[] = ['weekly' => count($lines), 'dry' => true]; }
      else {
        $res = tgSend($text, topicFor('report'));
        if (!empty($res['ok'])) markSent($key);
        $done[] = ['weekly' => count($lines), 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
      }
    }

    /* Tổng kết theo từng nhân sự — đi cùng giờ với tóm tắt tuần, nhưng
       khoá riêng cho từng người: một người gửi hỏng thì những người khác
       vẫn đi, lần cron sau chỉ gửi lại đúng người còn thiếu. */
    if (confGet('tg_staff_weekly')) {
      foreach (buildStaffWeekly() as $s) {
        $key = 'staffw:' . md5($s['name']) . ':' . $today;
        if (alreadySent($key)) continue;
        $text = '🧑‍🔧 <b>' . tgEsc($s['name']) . ' · tuần ' . date('d/m/Y') . "</b>\n\n"
              . implode("\n", $s['lines']);
        if ($dry) { $done[] = ['staff' => $s['name'], 'dry' => true]; continue; }
        $res = tgSend($text, topicFor('cards'));
        if (!empty($res['ok'])) markSent($key);
        $done[] = ['staff' => $s['name'], 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
      }
    }
  }

  /* --- bảng công việc hằng ngày --- */
  $wh = confGet('tg_work_hour', '-1');
  if ($wh !== null && (int)$wh >= 0 && (int)date('G', $now) >= (int)$wh) {
    $key = 'work:' . $today;
    if (!alreadySent($key)) {
      $lines = buildWork();
      if ($lines) {
        $text = '🗂 <b>Công việc · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines);
        if ($dry) { $done[] = ['work' => count($lines), 'dry' => true]; }
        else {
          $res = tgSend($text, topicFor('report'));
          if (!empty($res['ok'])) markSent($key);
          $done[] = ['work' => count($lines), 'ok' => !empty($res['ok']), 'error' => $res['error'] ?? null];
        }
      } else {
        if (!$dry) markSent($key);      // hôm nay không còn việc nào treo
        $done[] = ['work' => 0, 'note' => 'không có việc nào cần nhắc'];
      }
    }
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
          $res = tgSend($text, topicFor('report'));
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
