<?php
/* ============================================================
   cron.php — máy chủ tự chạy để gửi nhắc nhở qua Telegram.

   Đây là thứ làm cho lời nhắc tới đúng giờ kể cả khi bạn đã tắt app,
   tắt trình duyệt, tắt máy. Không có nó thì mọi thứ vẫn hiện trong app
   nhưng sẽ không có tin nào chạy vào Telegram.

   Hẹn giờ trong hPanel → Cron Jobs, chạy MỖI 5 PHÚT:

       /usr/bin/php /home/uXXXXXXXX/public_html/api/cron.php

   Nếu gói hosting chỉ cho gọi bằng đường link thì dùng:

       https://tenmien.com/api/cron.php?key=<khoá hiện trong Cài đặt>

   Chạy mỗi 5 phút là đủ: lời nhắc đặt 18:30 sẽ chạy trong khoảng
   18:30–18:35. Trễ quá một tiếng thì bỏ, không gửi muộn.
   ============================================================ */
require_once __DIR__ . '/lib.php';

$cli = (PHP_SAPI === 'cli');

if (!$cli) {
  /* Gọi qua đường link thì phải có khoá, nếu không ai cũng bấm cho chạy được */
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  $key = (string)($_GET['key'] ?? '');
  if (!hash_equals(cronKey(), $key)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sai khoá'], JSON_UNESCAPED_UNICODE);
    exit;
  }
}

$dry = $cli
  ? in_array('--dry', $argv ?? [], true)
  : isset($_GET['dry']);

$result = runSchedule($dry);

if ($cli) {
  /* in ra cho log của cron, nhìn là biết lần chạy vừa rồi làm gì */
  echo date('Y-m-d H:i:s') . '  ' . json_encode($result, JSON_UNESCAPED_UNICODE) . PHP_EOL;
} else {
  echo json_encode(['ok' => true, 'at' => date('c'), 'result' => $result], JSON_UNESCAPED_UNICODE);
}
