<?php
/* ============================================================
   webhook.php — Telegram gọi ngược về đây khi bạn bấm nút "✅ Xong"

   Khác với index.php: Telegram gọi thẳng, không có cookie phiên đăng
   nhập nào cả. Thứ xác thực duy nhất là secret_token trong header —
   Telegram tự đính kèm nó vào mọi lượt gọi sau khi setWebhook() đăng ký
   secret này. Ai không biết secret thì gọi vào cũng bị chặn ở đây.
   ============================================================ */
require_once __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');

$secret = (string)confGet('tg_webhook_secret', '');
$given  = (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
if ($secret === '' || !hash_equals($secret, $given)) {
  http_response_code(403);
  echo '{}';
  exit;
}

$raw = file_get_contents('php://input') ?: '';
$upd = json_decode($raw, true);
if (!is_array($upd)) { echo '{}'; exit; }

$token    = (string)confGet('tg_token', '');
$confChat = (string)confGet('tg_chat', '');
if ($token === '' || $confChat === '') { echo '{}'; exit; }

/* Ghi nhanh từ Telegram: nhắn "/ghi <nội dung>" (hoặc "+ <nội dung>") vào
   group là có ngay một mẩu trong Hộp ghi nhanh, khỏi mở app.
   Vì sao có hai cú pháp: bot mặc định bật "privacy mode", chỉ nhìn thấy
   tin bắt đầu bằng dấu / — nên "/ghi" lúc nào cũng chạy, còn "+" chỉ chạy
   sau khi tắt privacy trong BotFather. */
$msgIn = is_array($upd['message'] ?? null) ? $upd['message'] : null;
if ($msgIn !== null) {
  if ((string)($msgIn['chat']['id'] ?? '') !== $confChat) { echo '{}'; exit; }
  $said   = trim((string)($msgIn['text'] ?? ''));
  $thread = $msgIn['message_thread_id'] ?? null;
  $note   = '';

  if (preg_match('#^/(ghi|them|note|n)(?:@\S+)?(?:\s+(.*))?$#us', $said, $mm)) {
    $note = trim((string)($mm[2] ?? ''));
    /* Gõ mỗi "/ghi" rồi bỏ trống thì chỉ dẫn luôn, đừng im lặng — im lặng
       làm người ta tưởng cả tính năng hỏng chứ không phải gõ thiếu. */
    if ($note === '') {
      tgSend("Gõ nội dung ngay sau lệnh nhé:\n<code>/ghi mua thêm dầu gội</code>", $thread);
      echo '{}'; exit;
    }
  }
  elseif (preg_match('#^/(help|start|tro_giup)(?:@\S+)?#us', $said)) {
    tgSend(tgHelpText(), $thread);
    echo '{}'; exit;
  }
  /* Lệnh lạ — kể cả lệnh gõ có dấu tiếng Việt như "/tìm việc", thứ mà
     Telegram không coi là lệnh hợp lệ. Trả lời để biết bot vẫn nghe. */
  elseif ($said !== '' && $said[0] === '/') {
    tgSend("Không có lệnh này. " . tgHelpText(), $thread);
    echo '{}'; exit;
  }
  elseif ($said !== '' && $said[0] === '+') $note = trim(substr($said, 1));

  if ($note === '') { echo '{}'; exit; }

  $nowIso = isoNow();
  $item = ['id' => newId(), 'text' => $note, 'processed' => false, 'processedAs' => '',
           'createdAt' => $nowIso, 'updatedAt' => $nowIso, 'deleted' => false];
  db()->prepare('INSERT INTO items (kind, item_id, data, updated_at, deleted)
                 VALUES (?, ?, ?, ?, 0)')
      ->execute(['inbox', $item['id'], json_encode($item, JSON_UNESCAPED_UNICODE), $nowIso]);

  /* trả lời ngay trong nhánh vừa nhắn, để bạn biết nó đã vào */
  tgSend('📥 Đã ghi vào Hộp ghi nhanh:' . "\n<i>" . tgEsc(cutTitle($note, 200)) . '</i>', $thread);
  echo '{}';
  exit;
}

$cb = is_array($upd['callback_query'] ?? null) ? $upd['callback_query'] : null;
if (!is_array($cb)) { echo '{}'; exit; }   // Telegram gửi nhiều loại update khác, không quan tâm

$data   = (string)($cb['data'] ?? '');
$cbId   = (string)($cb['id'] ?? '');
$msg    = is_array($cb['message'] ?? null) ? $cb['message'] : [];
$chatId = (string)($msg['chat']['id'] ?? '');
$msgId  = $msg['message_id'] ?? null;

/* chỉ nhận nút bấm từ đúng group đã cấu hình — ai dò được URL webhook
   (dù có secret mới gọi được) cũng không đụng được dữ liệu nếu không
   phải đúng group của bạn */
if ($chatId === '' || $chatId !== $confChat) { echo '{}'; exit; }

/* Nút "Xong hôm nay" của lời nhắc lặp lại đi đường riêng: nó chỉ ghi thêm
   một ngày vào nhật ký, còn chuỗi 🔥 để app tự tính từ nhật ký đó — như
   vậy chỉ có một chỗ duy nhất biết luật tính chuỗi. */
if (preg_match('#^remdone:(.+)$#', $data, $m)) {
  $st = db()->prepare('SELECT data FROM items WHERE kind = ? AND item_id = ?');
  $st->execute(['reminders', $m[1]]);
  $row = $st->fetch();

  $ok = false; $already = false;
  if ($row) {
    $rem = json_decode((string)$row['data'], true);
    if (is_array($rem) && empty($rem['deleted'])) {
      $log = array_map('strval', (array)($rem['doneLog'] ?? []));
      $today = date('Y-m-d');
      if (in_array($today, $log, true)) { $already = true; }
      else {
        $log[] = $today;
        $rem['doneLog']   = array_slice($log, -80);
        $rem['updatedAt'] = isoNow();
        db()->prepare('UPDATE items SET data = ?, updated_at = ? WHERE kind = ? AND item_id = ?')
            ->execute([json_encode($rem, JSON_UNESCAPED_UNICODE), $rem['updatedAt'], 'reminders', $m[1]]);
      }
      $ok = true;
    }
  }

  httpPostJson("https://api.telegram.org/bot$token/answerCallbackQuery", [
    'callback_query_id' => $cbId,
    'text' => !$ok ? 'Không tìm thấy lời nhắc này (có thể đã xoá)'
            : ($already ? 'Hôm nay đã tick rồi ✓' : 'Đã ghi nhận xong hôm nay ✓'),
  ]);
  if ($ok && !$already && $msgId) {
    httpPostJson("https://api.telegram.org/bot$token/editMessageText", [
      'chat_id' => $chatId, 'message_id' => $msgId, 'parse_mode' => 'HTML',
      'text' => (string)($msg['text'] ?? '') . "\n\n✅ <b>Xong hôm nay</b>",
    ]);
  }
  echo '{}';
  exit;
}

/* Hai loại nút: đánh dấu xong, và dời lời nhắc lại N phút. Mã bấm nút
   Telegram cho tối đa 64 byte nên chỉ mang đúng loại, kho, id, số phút. */
$act = ''; $kind = ''; $id = ''; $mins = 0;
if (preg_match('#^done:(tasks|cards):(.+)$#', $data, $m)) {
  $act = 'done'; $kind = $m[1]; $id = $m[2];
} elseif (preg_match('#^snz:(tasks|cards):(.+):(\d+)$#', $data, $m)) {
  $act = 'snz'; $kind = $m[1]; $id = $m[2]; $mins = (int)$m[3];
  /* chỉ nhận đúng bốn mức đã bày ra — không để ai gõ tay số khác vào */
  if (!array_key_exists($mins, SNOOZE_MINS)) $act = '';
}

if ($act !== '') {
  /* tính mốc dời trước khi mở cơ sở dữ liệu, để câu trả lời cho Telegram
     và giá trị ghi vào bản ghi chắc chắn là cùng một con số */
  $until = $act === 'snz' ? time() + $mins * 60 : 0;

  $st = db()->prepare('SELECT data FROM items WHERE kind = ? AND item_id = ?');
  $st->execute([$kind, $id]);
  $row = $st->fetch();

  $ok = false; $rolled = ''; $streak = 0;
  if ($row) {
    $item = json_decode((string)$row['data'], true);
    if (is_array($item) && empty($item['deleted'])) {
      $now = isoNow();
      if ($act === 'done') {
        /* Việc lặp lại KHÔNG được đánh dấu xong vĩnh viễn — xong kỳ này thì
           hạn nhảy sang kỳ sau và chuỗi 🔥 cộng thêm một, đúng như bấm tick
           trong app. Trước đây chỗ này set done = true, tức là bấm Xong trên
           Telegram một cái là mất luôn việc lặp đó khỏi danh sách. */
        if ($kind === 'tasks' && isRepeat($item['repeat'] ?? '')) {
          $due    = substr((string)($item['due'] ?? ''), 0, 10);
          $onTime = $due === '' || $due >= date('Y-m-d');
          $streak = ($onTime ? (int)($item['streak'] ?? 0) : 0) + 1;
          $log    = array_map('strval', (array)($item['doneLog'] ?? []));
          $log[]  = date('Y-m-d');
          $item['streak']     = $streak;
          $item['bestStreak'] = max((int)($item['bestStreak'] ?? 0), $streak);
          $item['doneLog']    = array_slice($log, -80);
          $item['doneAt']     = date('Y-m-d');
          $item['due']        = $rolled = nextRepeat($due, (string)$item['repeat']);
        }
        elseif ($kind === 'tasks') { $item['done'] = true;  $item['doneAt'] = date('Y-m-d'); }
        else                       { $item['col']  = 'done'; $item['doneAt'] = date('Y-m-d'); }
        $item['snoozeUntil'] = '';        // xong rồi thì mốc dời cũ hết nghĩa
      } else {
        /* Chỉ dời lời nhắc, KHÔNG dời hạn: hạn trễ vẫn phải hiện là trễ,
           nếu không thì bấm dời vài lần là mất dấu việc đang chậm. */
        $item['snoozeUntil'] = date('Y-m-d H:i', $until);
      }
      $item['updatedAt'] = $now;
      db()->prepare('UPDATE items SET data = ?, updated_at = ? WHERE kind = ? AND item_id = ?')
          ->execute([json_encode($item, JSON_UNESCAPED_UNICODE), $now, $kind, $id]);
      $ok = true;
    }
  }

  if ($token !== '') {
    $chuoi = $streak > 1 ? ' · chuỗi ' . $streak . ' 🔥' : '';
    $said = $act !== 'done'  ? 'Đã dời tới ' . date('H:i d/m', $until)
          : ($rolled !== ''  ? 'Xong kỳ này · lần tới ' . date('d/m', strtotime($rolled)) . $chuoi
                             : 'Đã đánh dấu xong ✓');
    httpPostJson("https://api.telegram.org/bot$token/answerCallbackQuery", [
      'callback_query_id' => $cbId,
      'text' => $ok ? $said : 'Không tìm thấy việc này (có thể đã xoá)',
    ]);
    if ($ok && $msgId) {
      $origText = (string)($msg['text'] ?? '');
      $note = $act !== 'done' ? '⏰ <b>Đã dời tới ' . date('H:i d/m', $until) . '</b>'
            : ($rolled !== '' ? '✅ <b>Xong kỳ này</b> — lần tới ' . date('d/m', strtotime($rolled)) . $chuoi
                              : '✅ <b>Đã xong</b>');
      /* Không gửi kèm reply_markup nữa: bấm xong thì bộ nút cũ hết tác dụng,
         để lại chỉ khiến bấm nhầm lần hai. Lời nhắc sau sẽ có nút mới. */
      httpPostJson("https://api.telegram.org/bot$token/editMessageText", [
        'chat_id' => $chatId, 'message_id' => $msgId, 'parse_mode' => 'HTML',
        'text' => $origText . "\n\n" . $note,
      ]);
    }
  }
}

echo '{}';
