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
    'taskTopic'  => confGet('tg_task_topic', ''),
    'cardTopic'  => confGet('tg_card_topic', ''),
    'remTopic'   => confGet('tg_rem_topic', ''),
    'reportTopic'=> confGet('tg_report_topic', ''),
    'ideaTopic'  => confGet('tg_idea_topic', ''),
    'ideaHour'   => (int)confGet('tg_idea_hour', '9'),
    'workTopic'  => confGet('tg_work_topic', ''),     // cấu hình cũ, giữ để lùi về khi bốn ô trên còn trống
    'weeklyHour' => (int)confGet('tg_weekly_hour', '-1'),
    'staffWeekly'=> (bool)confGet('tg_staff_weekly', ''),
    'escalate'   => (bool)confGet('tg_escalate', ''),
    'webhookOn'  => (bool)confGet('tg_webhook_on', ''),
    'enabled'    => (bool)confGet('tg_enabled', ''),
    /* Cửa sổ làm việc nằm trong settings của app nên không đi qua đồng bộ.
       Trả về đây để app biết máy chủ đang dùng mốc nào mà đẩy lên cho khớp. */
    'workFrom'   => confGet('work_from', '08:30'),
    'workTo'     => confGet('work_to', '24:00'),
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

  /* Cửa sổ làm việc — app là nơi đặt, máy chủ chỉ giữ một bản để bản tóm
     tắt sáng tính "còn trống bao nhiêu" ra đúng con số như trên màn hình. */
  case 'work_save': {
    requireAuth();
    $f = trim((string)($in['from'] ?? ''));
    $t = trim((string)($in['to'] ?? ''));
    $ok = preg_match('/^\d{1,2}:\d{2}$/', $f) && preg_match('/^\d{1,2}:\d{2}$/', $t);
    if ($ok) { confSet('work_from', $f); confSet('work_to', $t); }
    out(['ok' => (bool)$ok, 'from' => confGet('work_from', '08:30'),
         'to' => confGet('work_to', '24:00')]);
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
    foreach (['taskTopic' => 'tg_task_topic', 'cardTopic' => 'tg_card_topic',
              'remTopic'  => 'tg_rem_topic',  'reportTopic' => 'tg_report_topic',
              'ideaTopic' => 'tg_idea_topic'] as $k => $conf)
      confSet($conf, trim((string)($in[$k] ?? '')));
    $ih = isset($in['ideaHour']) ? (int)$in['ideaHour'] : 9;
    confSet('tg_idea_hour', ($ih >= 0 && $ih <= 23) ? $ih : -1);
    $wk = isset($in['weeklyHour']) ? (int)$in['weeklyHour'] : -1;
    confSet('tg_weekly_hour', ($wk >= 0 && $wk <= 23) ? $wk : -1);
    confSet('tg_staff_weekly', !empty($in['staffWeekly']) ? '1' : '');
    confSet('tg_escalate', !empty($in['escalate']) ? '1' : '');
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

    /* Gom theo cặp group + nhánh, không phải theo group: giờ mỗi loại tin đi
       một nhánh riêng nên phải nhìn thấy đủ các nhánh vừa nhắn để chép ID. */
    $chats = [];
    foreach ((array)($res['result'] ?? []) as $u) {
      $msg = $u['message'] ?? $u['channel_post'] ?? null;
      if (!$msg || empty($msg['chat']['id'])) continue;
      $id    = (string)$msg['chat']['id'];
      $topic = (string)($msg['message_thread_id'] ?? '');
      $key   = $id . '/' . $topic;
      /* tên nhánh chỉ có ở tin đầu tiên của nhánh, hoặc ở tin được trả lời */
      $name  = $msg['reply_to_message']['forum_topic_created']['name']
            ?? $msg['forum_topic_created']['name'] ?? '';
      if (isset($chats[$key]) && $name === '') continue;
      $chats[$key] = [
        'id'    => $id,
        'title' => $msg['chat']['title'] ?? $msg['chat']['username'] ?? $msg['chat']['first_name'] ?? $id,
        'topic' => $topic,
        'name'  => (string)$name,
      ];
    }
    out(['ok' => true, 'chats' => array_values($chats)]);
  }

  /* chạy thử bộ hẹn giờ mà không gửi gì — để xem lịch có đúng không */
  case 'tg_dryrun': {
    requireAuth();
    out(['ok' => true, 'result' => runSchedule(true), 'digest' => buildDigest(),
         'work' => buildWork(), 'weekly' => buildWeekly()]);
  }

  /* Gửi bảng công việc ngay bây giờ, không chờ tới giờ đã hẹn. */
  case 'tg_work_now': {
    requireAuth();
    $lines = buildWork();
    if (!$lines) out(['ok' => true, 'empty' => true]);
    $res = tgSend('🗂 <b>Công việc · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines), topicFor('report'));
    if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    out(['ok' => true, 'lines' => count($lines)]);
  }

  /* Gửi thử một lời nhắc lặp lại ngay — đi đúng đường của bộ hẹn giờ, nên
     có cả nút "Xong hôm nay". Đọc bản ghi từ máy chủ chứ không nhận nội
     dung từ trình duyệt: gửi thử phải giống hệt tin thật, kể cả khi máy
     này đang giữ một bản chưa đồng bộ lên. */
  case 'tg_rem_now': {
    requireAuth();
    $id = trim((string)($in['id'] ?? ''));
    $rem = null;
    foreach (itemsOf('reminders') as $r) if ((string)($r['id'] ?? '') === $id) { $rem = $r; break; }
    if ($rem === null)
      fail('Máy chủ chưa có lời nhắc này — bấm Đồng bộ ngay ở mục Tài khoản rồi thử lại');
    $res = tgSend(remText($rem), remTopic($rem), tgRemButtons($id));
    if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    out(['ok' => true, 'buttons' => tgRemButtons($id) !== null]);
  }

  /* Gửi tổng kết theo nhân sự ngay, không chờ tới Chủ nhật. */
  case 'tg_staff_now': {
    requireAuth();
    $people = buildStaffWeekly();
    if (!$people) out(['ok' => true, 'empty' => true]);
    foreach ($people as $s) {
      $res = tgSend('🧑‍🔧 <b>' . tgEsc($s['name']) . ' · tuần ' . date('d/m/Y') . "</b>\n\n"
                    . implode("\n", $s['lines']), topicFor('cards'));
      if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    }
    out(['ok' => true, 'people' => count($people)]);
  }

  /* Vì sao lời nhắc chưa tới Telegram — chỉ đọc, không gửi gì. */
  case 'tg_why': {
    requireAuth();
    out(array_merge(['ok' => true], tgWhy()));
  }

  /* Gửi tóm tắt tuần ngay, không chờ tới Chủ nhật. */
  case 'tg_weekly_now': {
    requireAuth();
    $lines = buildWeekly();
    $res = tgSend('📅 <b>Tuần này · ' . date('d/m/Y') . "</b>\n\n" . implode("\n", $lines), topicFor('report'));
    if (empty($res['ok'])) fail($res['error'] ?? 'Gửi không thành công', 502);
    out(['ok' => true, 'lines' => count($lines)]);
  }

  /* Bật nút "✅ Xong" dưới các tin nhắc — cần đăng ký webhook với Telegram
     để nó biết gọi ngược về đâu khi có người bấm nút. */
  case 'tg_webhook_enable': {
    requireAuth();
    $token = (string)confGet('tg_token', '');
    if ($token === '') fail('Chưa có mã bot Telegram');
    $secret = webhookSecret();
    $base = (isHttps() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '')
          . str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    if (!isHttps()) fail('Cần https để Telegram gọi ngược lại — bật SSL cho tên miền trước.');
    $hookUrl = $base . '/webhook.php';
    $res = httpPostJson("https://api.telegram.org/bot$token/setWebhook", [
      /* message: để nhắn "/ghi …" thẳng vào group là có mẩu ghi nhanh */
      'url' => $hookUrl, 'secret_token' => $secret,
      'allowed_updates' => ['callback_query', 'message'],
    ]);
    if (empty($res['ok'])) fail($res['error'] ?? 'Không bật được nút Xong', 502);
    /* Đăng ký danh sách lệnh: gõ dấu / trong group là Telegram hiện menu.
       Không có bước này thì chẳng ai đoán được lệnh tên là "/ghi". */
    httpPostJson("https://api.telegram.org/bot$token/setMyCommands", ['commands' => [
      ['command' => 'ghi',  'description' => 'Ghi nhanh vào Hộp ghi nhanh'],
      ['command' => 'help', 'description' => 'Xem cách dùng bot'],
    ]]);
    confSet('tg_webhook_on', '1');
    out(['ok' => true, 'url' => $hookUrl]);
  }

  /* Telegram đang thấy webhook thế nào — trả lời thẳng câu "bấm /ghi mà
     không thấy gì". Chỉ đọc, không đổi cấu hình. */
  case 'tg_webhook_info': {
    requireAuth();
    $token = (string)confGet('tg_token', '');
    if ($token === '') fail('Chưa có mã bot Telegram');
    $res = httpPostJson("https://api.telegram.org/bot$token/getWebhookInfo", []);
    if (empty($res['ok'])) fail($res['error'] ?? 'Không hỏi được Telegram', 502);
    $r = (array)($res['result'] ?? []);
    $allowed = (array)($r['allowed_updates'] ?? []);
    out(['ok' => true,
      'url'       => (string)($r['url'] ?? ''),
      /* Telegram trả về mảng rỗng nghĩa là "nhận mọi loại trừ vài loại hiếm",
         nên rỗng cũng tính là có nghe tin nhắn. */
      'onMessage' => $allowed === [] || in_array('message', $allowed, true),
      'onButton'  => $allowed === [] || in_array('callback_query', $allowed, true),
      'allowed'   => $allowed,
      'pending'   => (int)($r['pending_update_count'] ?? 0),
      'lastError' => (string)($r['last_error_message'] ?? ''),
      'lastErrorAt' => !empty($r['last_error_date']) ? date('H:i d/m', (int)$r['last_error_date']) : '',
    ]);
  }

  case 'tg_webhook_disable': {
    requireAuth();
    $token = (string)confGet('tg_token', '');
    if ($token !== '') httpPostJson("https://api.telegram.org/bot$token/deleteWebhook", []);
    confSet('tg_webhook_on', '');
    out(['ok' => true]);
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
