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
$cb  = is_array($upd) ? ($upd['callback_query'] ?? null) : null;
if (!is_array($cb)) { echo '{}'; exit; }   // Telegram gửi nhiều loại update khác, không quan tâm

$token  = (string)confGet('tg_token', '');
$data   = (string)($cb['data'] ?? '');
$cbId   = (string)($cb['id'] ?? '');
$msg    = is_array($cb['message'] ?? null) ? $cb['message'] : [];
$chatId = (string)($msg['chat']['id'] ?? '');
$msgId  = $msg['message_id'] ?? null;

/* chỉ nhận nút bấm từ đúng group đã cấu hình — ai dò được URL webhook
   (dù có secret mới gọi được) cũng không đụng được dữ liệu nếu không
   phải đúng group của bạn */
$confChat = (string)confGet('tg_chat', '');
if ($token === '' || $confChat === '' || $chatId === '' || $chatId !== $confChat) { echo '{}'; exit; }

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

  $ok = false;
  if ($row) {
    $item = json_decode((string)$row['data'], true);
    if (is_array($item) && empty($item['deleted'])) {
      $now = isoNow();
      if ($act === 'done') {
        if ($kind === 'tasks') { $item['done'] = true;  $item['doneAt'] = date('Y-m-d'); }
        else                   { $item['col']  = 'done'; $item['doneAt'] = date('Y-m-d'); }
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
    $said = $act === 'done' ? 'Đã đánh dấu xong ✓'
                            : 'Đã dời tới ' . date('H:i d/m', $until);
    httpPostJson("https://api.telegram.org/bot$token/answerCallbackQuery", [
      'callback_query_id' => $cbId,
      'text' => $ok ? $said : 'Không tìm thấy việc này (có thể đã xoá)',
    ]);
    if ($ok && $msgId) {
      $origText = (string)($msg['text'] ?? '');
      $note = $act === 'done' ? '✅ <b>Đã xong</b>'
                              : '⏰ <b>Đã dời tới ' . date('H:i d/m', $until) . '</b>';
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
