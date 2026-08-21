# Life Hub

App cá nhân để quản lý **mối quan hệ** và **công việc nhiều mảng** — chạy offline, cài được như app trên điện thoại, và khi đưa lên hosting thì có **đăng nhập bằng mật khẩu** cùng **đồng bộ giữa các thiết bị** qua máy chủ của chính bạn.

---

## Dùng thử ngay

Mở app kèm `?demo` để nạp một bộ dữ liệu mẫu đầy đủ (12 người năm nhóm, 16 lượt trao đổi, 15 việc có lặp và chuỗi, 17 thẻ giao việc cho 4 nhân sự, 7 dịp lễ có âm lịch):

```
https://tenmien-cua-ban.com/?demo
```

Chỉ nạp khi dữ liệu còn trống nên không sợ đè lên dữ liệu thật. Hoặc bấm **Dùng dữ liệu mẫu** ở màn hình chào. Xoá sạch trong Cài đặt là về trắng.

## Chạy thử trên máy

```bash
node serve.js
```

rồi mở `http://localhost:5199`. `serve.js` phục vụ thẳng thư mục gốc — đúng thứ chạy trên máy chủ — và giả lập luôn phần PHP bằng Node, nên thử được cả đăng nhập, đồng bộ và lịch nhắc Telegram mà không cần cài PHP.

Trên điện thoại cùng wifi: thay `localhost` bằng IP máy tính.

---

## Đưa lên Hostinger

**Không có bước dựng nào cả.** Thư mục gốc của repo chính là thư mục chạy thật.

### Cách dùng: Git tự động deploy

Trong hPanel → **Git**, trỏ tới repo này và nhánh `main`, đường dẫn đích là `public_html`. Từ đó mỗi lần bạn `git push`, Hostinger tự kéo về và trang đổi theo.

Không cần chạy lệnh gì trước khi push. Sửa code → commit → push → xong.

Một việc duy nhất phải nhớ khi sửa code: **đổi `APP_BUILD` ở đầu `js/state.js`** (dạng `ngày.lần-trong-ngày`, ví dụ `2026-08-21.4`). Không có bước dựng nên không ai đổi hộ được, và **Cài đặt → Phiên bản** dựa vào số này để trả lời câu "web đã cập nhật chưa". Phần ngày so bằng chữ, phần lần-trong-ngày so bằng số — nên `.10` mới hơn `.7`, đúng như mong đợi.

### Web như chưa đổi gì — xem ở đâu

Vào **Cài đặt → Phiên bản**. Nó nói bản đang chạy, rồi hỏi thẳng file `js/state.js` trên máy chủ (bỏ qua mọi bộ nhớ đệm) để so:

* **Máy chủ cũng đang ở bản này** — code đã lên, kèm giờ file được sửa trên máy chủ.
* **Máy chủ đã có bản mới hơn** — máy này còn giữ bản cũ. Bấm **Tải lại ngay**: nó bảo service worker xoá bộ nhớ đệm, **đợi báo xong** rồi mới tải lại.
* **Máy chủ vẫn ở bản cũ** (số nhỏ hơn cái bạn vừa push) — Hostinger chưa kéo code về. Vào hPanel → Git → **Deploy**. Hostinger chỉ tự kéo khi webhook đã gắn bên GitHub.

Dưới đó còn một dòng cho biết **có service worker đang phục vụ trang này hay không**. Đây là chỗ giải thích hiện tượng khó chịu nhất: *cửa sổ ẩn danh vào được bản mới, cửa sổ thường thì kẹt ở bản cũ*. Ẩn danh khởi đầu với đệm rỗng nên nó luôn thấy bản mới; cửa sổ thường thì một service worker đời cũ vẫn đang cầm trịch, và nó không tự chết chỉ vì bạn bấm F5.

Nút **Gỡ sạch & tải lại** dọn cả **ba** tầng đệm, vì đúng là có ba chứ không phải một:

1. **service worker** — gỡ hẳn đăng ký, không chỉ xoá kho của nó.
2. **Cache API** — xoá mọi kho.
3. **đệm HTTP của chính trình duyệt** — tầng này hay bị bỏ sót nhất. Thêm `?fresh=…` chỉ làm mới cái *trang*; tám thẻ `<script src="js/…">` bên trong vẫn xin đúng URL cũ, nên bản cũ nằm trong đệm HTTP vẫn được đưa ra như thường — gỡ sạch xong tải lại vẫn ra bản cũ. Nút này tải lại cả 11 tệp code bằng `cache:'reload'`, vừa lấy mới từ máy chủ vừa **ghi đè luôn vào đệm HTTP**, rồi mới nạp lại trang.

Xong việc nó **kể lại đã dọn được gì** ("gỡ 1 service worker · xoá 2 bộ nhớ đệm · tải mới 11/11 tệp code · đang chạy bản …"). Bấm một nút mà không biết nó có làm gì hay không thì không lần ra được lỗi.

Dữ liệu không mất — nó nằm trên máy chủ, và bản trong máy cũng không bị đụng tới.

Nếu bản đang kẹt cũ tới mức chưa có khối này (trước `2026-08-21.4`) thì phải làm tay: Chrome → bấm biểu tượng bên trái thanh địa chỉ → **Cookie và dữ liệu trang** → **Xoá dữ liệu** → tải lại. Trên điện thoại: Cài đặt trình duyệt → Cài đặt trang → tìm tên miền → Xoá dữ liệu.

### Ba điều phải nhớ

1. **Bật SSL** trong hPanel. Không có `https` thì trình duyệt chặn cài app, chặn thông báo, chặn micro, và cookie đăng nhập cũng không gửi đi được.

2. **`.htaccess` phải lên được máy chủ.** File này quyết định việc trình duyệt có chịu lấy code mới hay không. File Manager của Hostinger mặc định giấu file bắt đầu bằng dấu chấm — bật **Show hidden files** để kiểm tra nó có trong `public_html` không.

3. **`api/config.php` bạn tự tạo trên máy chủ, git không đụng tới.** Nó nằm trong `.gitignore` nên các lần deploy sau không ghi đè và cũng không xoá mất.

### Chỗ để file dữ liệu — đọc kỹ phần này

Mặc định cơ sở dữ liệu nằm ở `api/data/lifehub.sqlite`, tức là **bên trong vùng mà Git deploy quản lý**. Tuỳ cách Hostinger dọn thư mục trước mỗi lần kéo về, file này có thể bị xoá — mất sạch dữ liệu.

Cách chắc chắn: để nó **ra ngoài** `public_html`. Tạo một thư mục bằng File Manager, ví dụ `/home/uXXXXXXXX/lifehub-data/`, rồi mở `api/config.php` thêm dòng:

```php
define('LH_DB_FILE', '/home/uXXXXXXXX/lifehub-data/lifehub.sqlite');
```

(thay `uXXXXXXXX` bằng mã tài khoản thật của bạn — nhìn thấy trong File Manager)

Nếu file dữ liệu đang nằm trong vùng web, màn hình **Cài đặt → Xem máy chủ** sẽ hiện cảnh báo đỏ nhắc bạn chuyển đi.

Dù để ở đâu, vẫn nên thỉnh thoảng bấm **Xuất sao lưu** trong app.

### Cập nhật code mới có tới người dùng không?

Có. Luật rất đơn giản, và cố tình đơn giản:

- `.htaccess` bắt `html`/`css`/`js` **luôn hỏi lại máy chủ**. Nội dung không đổi thì máy chủ trả 304 rỗng, gần như không tốn gì.
- Service worker **hỏi máy chủ trước** với code của app (`html`, `css`, `js`). Mất mạng mới lấy bản đã lưu. Nghĩa là mở app ra lúc nào cũng là code mới nhất.
- Ảnh, icon, manifest thì ngược lại: lấy bản đã lưu cho nhanh, làm mới ngầm phía sau. Mấy tệp này gần như không đổi nên chậm một nhịp cũng không sao.
- App mở suốt cả ngày trên điện thoại rồi mình đẩy bản mới lên? Quay lại app là nó hỏi máy chủ một lần (thưa thôi, mười phút một lần), thấy `APP_BUILD` mới hơn thì hiện thanh **"Đã có bản mới (…) của app · Tải lại"**. Không tự tải lại — đang gõ dở mà trang nhảy thì rất khó chịu.

#### Vì sao bản trước hay "tải lại xong lại về bản cũ"

Service worker đời trước làm ngược: code cũng lấy từ bộ nhớ đệm trước. Vào app là chạy code của **lần trước**, tải bản mới về để dành cho lần sau, rồi mời tải lại — mà lần tải lại đó lại rơi đúng vào bản đang nằm trong đệm. Mở ra thấy bản mới, bấm Tải lại, quay về bản cũ.

Hai chỗ nữa cùng góp phần, đã sửa luôn:

- Bấm **Tải lại** chỉ đợi bừa 220ms cho service worker dọn đệm. Điện thoại dọn chậm hơn chừng đó là hỏng. Giờ trang **đợi service worker báo đã xoá xong** mới tải lại (quá 3 giây không thấy trả lời thì vẫn tải lại, không kẹt).
- Lời mời tải lại trước đây dựa vào "tệp có khác byte nào không", nên app **đang chạy đúng bản mới nhất vẫn bị nhắc**. Giờ chỉ nhắc khi `APP_BUILD` trên máy chủ thật sự mới hơn bản đang chạy.

Nếu vì lý do gì đó vẫn kẹt ở bản cũ: Cài đặt → Phiên bản → **Gỡ sạch & tải lại**.

### Riêng tư

- *Chưa cài `api/config.php`* — dữ liệu chỉ nằm trong trình duyệt của bạn. Người lạ mở đúng địa chỉ thấy một app trắng trơn.
- *Đã cài* — dữ liệu nằm trên máy chủ và **phải có mật khẩu mới xem được**. Người lạ chỉ thấy màn hình đăng nhập.

Vì gốc repo là thư mục chạy thật nên vài file chỉ dùng lúc phát triển (`serve.js`, `README.md`, `tools/`, `supabase-schema.sql`) cũng bị kéo lên theo. `.htaccess` đã chặn không cho tải chúng về.

---

## Cấu trúc

| File | Việc của nó |
|---|---|
| `index.html` | khung trang |
| `css/style.css` | toàn bộ giao diện |
| `js/state.js` | dữ liệu, ngày tháng, tiền tệ, migration |
| `js/lunar.js` | đổi dương ⇄ âm lịch (thuật toán Hồ Ngọc Đức) |
| `js/voice.js` | đọc thành chữ tiếng Việt |
| `js/api.js` | gọi máy chủ + màn hình đăng nhập |
| `js/sync.js` | đồng bộ (máy chủ riêng hoặc Supabase) |
| `js/notify.js` | thông báo nhắc nhở |
| `js/views.js` | dựng HTML từng màn hình |
| `js/app.js` | biểu mẫu + xử lý sự kiện |
| `sw.js`, `manifest.webmanifest` | cài như app, chạy offline, báo có bản mới |
| `.htaccess` | ép https, nén, chặn cache cũ, giấu file phát triển |
| `robots.txt` | không cho công cụ tìm kiếm lập chỉ mục |
| `api/index.php` | máy chủ: đăng nhập + đồng bộ (SQLite) |
| `api/lib.php` | phần dùng chung: dữ liệu, Telegram, bộ hẹn giờ |
| `api/cron.php` | hPanel gọi mỗi 5 phút để gửi nhắc nhở |
| `api/config.example.php` | mẫu cấu hình — chép thành `config.php` trên máy chủ |
| `tools/hash-password.js` | tạo mã mật khẩu để dán vào `config.php` |
| `icon.svg`, `assets/*.png` | biểu tượng (PNG cần cho iOS và cho thông báo) |
| `tools/make-icons.js` | sinh PNG từ `icon.svg`, không cần thư viện ngoài |
| `serve.js` | máy chủ thử trên máy (có giả lập luôn phần PHP) |
| `supabase-schema.sql` | chỉ cần nếu dùng cách đồng bộ cũ |

Mọi thứ trong bảng này đều nằm ở thư mục gốc và đều lên máy chủ — không có bước dựng, không có thư mục `dist`. Bốn dòng cuối chỉ dùng lúc phát triển nên `.htaccess` chặn không cho tải về.

Riêng `api/config.php` (mã mật khẩu) và `api/data/` (cơ sở dữ liệu) **không** vào git: bạn tạo chúng một lần trên máy chủ, deploy về sau không đụng tới.

---

## Các màn hình

### Tổng quan

Màn hình mở ra nhiều nhất trong ngày, nên hai khối đầu là hai thứ dùng để sắp xếp:

| Khối | Trả lời câu |
|---|---|
| **Trục cả tuần** | *Tuần này nằm ở đâu, và hôm nay nên làm gì?* — bảy cột T2→CN, bấm cột nào là mở trục ngày đó, **kéo thả được ngay tại chỗ** |
| **Đang bị né** | *Việc nào mình đang tránh?* — những việc đã bấm **→ Mai** từ ba lần trở lên |

Cố ý là **cả tuần** chứ không chỉ hôm nay: sắp xếp thì phải nhìn cả tuần, vì dời một việc khỏi thứ Sáu là phải biết thứ Bảy đang trống bao nhiêu.

Và cố ý dùng **thẳng** khối của mục Hằng ngày chứ không dựng một bản rút gọn riêng — kéo thả được luôn, và hai màn hình không bao giờ lệch nhau vì chúng là một. `S.dailyDay` dùng chung, nên đổi ngày ở đây thì mở mục Hằng ngày cũng đúng ngày đó.

Khi ngày đang xem **là hôm nay**, khối *Cửa sổ / Kín / Trống* nói thêm hai con số chỉ đúng cho hôm nay: chỗ trống tính **từ bây giờ** tới hết cửa sổ (22 giờ tối mà báo *"còn trống 14h25"* thì đúng về số học nhưng vô dụng — chỗ trống hồi 9 giờ sáng đâu còn nhét được gì), và những việc **đã qua giờ mà chưa tích**.

#### Đang bị né — ba đường ra, không có đường thứ tư

Dời một hai lần là bận. Dời tới lần thứ ba thì không phải bận nữa: đó là việc bạn không muốn làm, và mỗi ngày nó lại chiếm một dòng để bạn lướt qua. App đã đếm *"đã dời N lần"* từ trước, nhưng đếm xong thì bạn vẫn chỉ có mỗi nút **→ Mai**. Giờ có ba nút thật:

| Nút | Làm gì |
|---|---|
| **✂ Chia nhỏ** | mở ô nhập *mỗi dòng một việc nhỏ*. Mỗi mẩu thừa hưởng mảng việc của việc cũ, và **lùi hạn dần mỗi mẩu một ngày** — dồn hết vào một ngày thì mai lại là một ngày quá tải nữa. Việc cũ được thay bằng những mẩu này, mỗi mẩu đếm lại từ 0 lần dời, và mang ghi chú *"Tách ra từ: …"* |
| **→ Giao cho ai** | chuyển hẳn thành **thẻ việc đã giao** trong mục Công việc, giữ nguyên tên, mảng việc và hạn. Vẫn theo dõi được, chỉ là không còn nằm trong ngày của bạn |
| **Bỏ hẳn** | hỏi lại một câu rồi xoá. Không làm cũng là một quyết định |

Cả ba đều **kết thúc việc cũ**. Để nó nằm lại thì hôm sau nó lại xuất hiện y nguyên, và cái nút bạn vừa bấm chẳng có nghĩa gì. Cố ý **không** có nút thứ tư tên là *"để đó"* — cái đó bấm bằng cách không làm gì cả.

Khối này cũng vào **tổng kết tuần Telegram** (🔁 *Đang bị né*), tách riêng khỏi khối ⚠️ *Đang trễ*: trễ là chưa kịp làm, né là chuyện khác, và cách xử hai thứ đó khác nhau.

Dưới hai khối đó là phần cũ: việc đã giao đang trễ, dịp và sinh nhật sắp tới, ân tình chưa trả, và mục **“Hôm nay nên hỏi thăm ai”** gợi ý ba người đang bị bỏ quên lâu nhất so với chu kỳ của nhóm họ.

### Quan hệ — năm module S / S2 / A / B / C
Cuộn một mạch từ trên xuống, mỗi nhóm là một khối riêng có tiêu đề và đường ngăn, người bên trong hiển thị dạng **thẻ**.

| Nhóm | Ý nghĩa | Nhắc liên lạc |
|---|---|---|
| **S** | Ba mẹ, anh chị em, người trong nhà | 14 ngày |
| **S2** | Cô dì chú bác, họ hàng gần | 21 ngày |
| **A** | Thân hơn bạn bè, chưa tới mức gia đình | 30 ngày |
| **B** | Bạn bè, đồng nghiệp thân thiết | 60 ngày |
| **C** | Có qua lại nhưng không quá sâu | 150 ngày |

**S** và **S2** tách ra vì không phải người nhà nào cũng ở cùng khoảng cách: ba mẹ khác cô dì chú bác, cả về mức độ hỏi thăm lẫn mức quà app gợi ý (S 1tr · S2 800k).

Vòng tròn trên mỗi thẻ là **điểm chăm sóc 0–100**: 100 là vừa liên lạc, tụt dần theo số ngày im lặng so với chu kỳ của nhóm. Trong mỗi nhóm, người có điểm thấp nhất được xếp lên trước — nhìn là biết ai đang bị bỏ quên.

Đổi nhóm bất cứ lúc nào, mỗi lần đổi đều được ghi vào lịch sử.

**Nhật ký gặp gỡ:** mỗi lần cà phê / gọi điện / được giúp đỡ, ghi một dòng. Hiện thành dòng thời gian trong trang từng người và tự cập nhật ngày liên lạc gần nhất.

**Sổ trao đổi:** ghi món họ tặng kèm giá ước tính → tick ô vuông để khai mình đã trả lại bằng gì, bao nhiêu, ngày nào. App tự tính phần còn nợ.
Ô nhập tiền hiểu: `300k` · `1tr2` · `1,5tr` · `1tr250` · `250.000` · `2 tỷ`.

### Công việc
- **Việc cần làm** — tự chia Quá hạn / Hôm nay / Sắp tới / Không hạn. Mỗi việc có ô **Ước tính (phút)**; việc đến hạn mà có đặt giờ nhắc sẽ hiện luôn trên dòng thời gian của tab [Việc hằng ngày](#việc-hằng-ngày).
- **Việc lặp lại** — hàng ngày, cách ngày, hàng tuần, 2 tuần, hàng tháng, mỗi quý, nửa năm, hàng năm. Tick xong là hạn tự nhảy sang kỳ kế tiếp, kèm **chuỗi 🔥** đếm số kỳ làm đúng hẹn liên tiếp (bỏ lỡ thì chuỗi về 0). Nếu bỏ lỡ nhiều kỳ, app nhảy thẳng tới mốc sắp tới chứ không dồn việc.

### Việc hằng ngày

Màn riêng ở thanh bên — **🔁 Việc hằng ngày**. Đây là những việc lặp đi lặp lại có giờ cố định: tập gym, trả lời tin nhắn khách, chốt sổ cuối ngày. Khác với **Công việc** ở chỗ nó không có hạn để hoàn thành — nó là nhịp sống hằng tuần.

Mỗi việc gồm: tên, **giờ**, **mất bao lâu (phút)**, những thứ trong tuần, mảng việc, ghi chú. Số phút là thứ mới — có nó thì mới xếp được việc lên trục thời gian và mới biết việc nào đè lên việc nào.

> Cùng một bản ghi với **Nhắc lặp lại** trước đây. Không phải làm lại từ đầu: mọi lời nhắc cũ tự có mặt ở đây, mặc định 15 phút cho tới khi bạn sửa. Danh sách trong Cài đặt đã dọn đi, chỉ còn đường dẫn sang màn này — để một việc chỉ có một chỗ sửa.

Ba tab:

| Tab | Cho việc gì |
|---|---|
| **Hôm nay** | danh sách tích ô: cả việc hằng ngày lẫn **việc lẻ đến hạn**, xếp theo giờ. Trên đầu là thanh gọn cho thấy ngày dồn vào khúc nào, kèm dòng **Cửa sổ / Kín / Trống / ⚠ chồng giờ** và thanh tiến độ. |
| **Cả tuần** | bảy cột T2→CN, cột càng cao là ngày càng nặng. Bấm một cột để xem trục thời gian của ngày đó. |
| **Tất cả** | danh sách phẳng như cũ: bật/tắt, gửi thử ➤, dải bảy ngày gần nhất. |

Số trên menu bên trái là **số việc hôm nay chưa tick xong**.

#### Dòng thời gian

Tab **Cả tuần** xếp mọi việc của một thứ lên một trục ngang. Mỗi việc một hàng, khối rộng đúng bằng số phút bạn điền.

- **Kéo ngang một khối** để dời giờ, nhích theo từng 5 phút. Nhả tay ở đâu cũng được, kể cả kéo vượt ra ngoài trục.
- Hoặc **gõ thẳng ô giờ** bên dưới khi cần đúng phút — trên điện thoại kéo trúng 5 phút là chuyện khó.
- **Ô phút** ngay cạnh, sửa xong là ghi luôn, không phải mở biểu mẫu.

Mỗi việc chỉ có **một** giờ dùng cho cả tuần, nên dời ở thứ này là dời cho mọi thứ khác mà nó đang bật. App nói rõ điều đó ngay lúc bạn thả tay.

**Chồng giờ.** Hai việc có khoảng giờ cắt nhau thì cả hai bị viền đỏ, cột ngày tương ứng hiện `⚠ 2`, và trên đầu có một dòng đếm tổng cả tuần. Việc đang tắt không tính — tắt rồi thì trùng cũng chẳng sao, nhưng vẫn hiện mờ để bạn nhớ là nó có tồn tại.

Trục luôn dừng ở mốc giờ tròn và luôn rộng ít nhất 4 tiếng — một ngày chỉ có mỗi việc 15 phút mà kéo giãn ra cả màn hình thì nhìn như cả ngày chỉ làm mỗi việc đó.

Số phút bỏ trống, bằng 0, âm hay gõ bậy đều rơi về **15 phút**; quá 12 tiếng thì cắt còn 12 tiếng. Máy chủ dùng đúng luật này nên hai bên không bao giờ ra hai con số khác nhau.

#### Việc lẻ trên trục hôm nay

Tab **Hôm nay** là một ngày có thật, nên việc lẻ bên **Công việc** cũng chiếm giờ của nó. Việc lẻ lên trục khi hội đủ hai điều: **đến hạn** (hôm nay hoặc đã quá hạn, chưa xong) và **có giờ** ở ô *Nhắn Telegram lúc*.

Mỗi việc cần làm giờ có thêm ô **Ước tính (phút)**. Bỏ trống thì app tạm tính 30 phút và ghi rõ bằng dấu `~` cùng chữ *chưa ước tính* — để bạn phân biệt "mình đoán 30" với "bạn bảo 30". Tin Telegram chỉ ghi thời lượng khi bạn có điền thật, không bịa số tạm vào tin nhắn.

Việc lẻ vẽ **nét đứt** cho khác việc hằng ngày, và dòng phụ ghi *việc lẻ, hạn hôm nay* hoặc *việc lẻ, trễ 3 ngày*.

Việc đến hạn mà **chưa đặt giờ** không lên được trục, nên nằm ở mục **Chưa xếp giờ** ngay dưới, kèm tổng ước tính — nó vẫn ngốn thời gian thật của bạn dù chưa có chỗ trên đồng hồ.

Mỗi việc ở đó có nút **→ Xếp vào 10:05**: app đã biết bạn trống khoảng nào và biết việc này cần bao lâu, nên một cú bấm là xong, không phải mở biểu mẫu gõ giờ. Chỉ nhận chỗ trống **từ bây giờ trở đi** — xếp vào 08:30 lúc đã 15:00 thì chẳng để làm gì. Nhiều việc thì gợi ý **nối tiếp nhau**, việc sau không nhận lại giờ của việc trước. Không còn chỗ nào đủ rộng thì nó nói thẳng thay vì đề nghị bừa.

#### Việc lẻ trên trục cả tuần

Bảy cột của tab **Cả tuần** ứng với bảy ngày có thật của tuần này — T2 → CN, và CN là cột cuối tuần này chứ không phải ngày đầu tuần sau. Việc lẻ đến hạn ngày nào thì nằm ở cột đó. Riêng cột hôm nay ôm luôn việc quá hạn: nợ cũ đang chiếm giờ của hôm nay chứ không nằm lại cái ngày đã trôi qua.

Cột chia **hai màu**: phần dưới (cam) là việc lẻ, phần trên là việc hằng ngày — cột cao mà không biết vì sao cao thì con số chẳng giúp được gì. Số `+2` dưới cột là việc lẻ **chưa xếp giờ** của ngày đó. Ngày đã qua thì cột mờ đi.

Chọn một ngày rồi kéo khối trên trục, hoặc sửa thẳng ô giờ ở hàng bên dưới. Hai loại khác nhau ở một điểm quan trọng:

* **Việc hằng ngày** chỉ có *một* giờ dùng chung cho mọi thứ nó đang bật — dời ở T4 là dời luôn cho T2 và T6.
* **Việc lẻ** (hàng nét đứt, gắn nhãn *việc lẻ*) thì giờ là của riêng nó, dời chỉ ảnh hưởng chính nó.

Mỗi hàng có **ô tích** ngay đầu dòng để tick cho nhanh mà không phải nhảy tab. Chỉ **cột hôm nay** mới bấm được — "xong" là chuyện của một ngày cụ thể, tick hộ ngày mai thì chẳng biết ghi vào đâu; cột khác vẫn hiện đúng trạng thái của ngày đó, chỉ là mờ và không bấm được. Tick xong thì hàng **mờ và gạch ngang**, đúng như khối của nó trên trục.

Mục **Chưa xếp giờ** cũng có ở đây, và nút **→ Xếp vào** tính theo cửa sổ của đúng ngày đang xem: hôm nay thì chỉ nhận chỗ trống từ bây giờ trở đi, ngày mai trở đi thì lấy trọn cửa sổ, ngày đã qua thì thôi không đề nghị nữa.

#### Dời sang mai

Ngày kín quá thì mỗi việc lẻ có nút **→ Mai**: hạn nhảy sang ngày mai và mốc dời nhắc cũ bị xoá theo. Việc đang trễ ba ngày mà bấm thì ra **ngày mai thật**, không phải hai hôm trước.

App **đếm số lần dời**. Dời một lần là dòng phụ đã ghi *đã dời 1 lần* màu cam; từ lần thứ ba đổi sang đỏ, nút thành **→ Mai ⚠**, và bản tóm tắt sáng qua Telegram cũng ghi kèm *— đã dời 4 lần*. Một việc dời tới lần thứ ba không còn là việc bận, nó là việc mình đang né: chia nhỏ ra hoặc bỏ hẳn đi.

Việc **lặp lại** thì mỗi kỳ đếm lại từ đầu — tick xong kỳ này là kỳ sau bắt đầu sạch. Bỏ tích thì số lần dời của kỳ trước quay lại.

#### Tích xong việc

Tab **Hôm nay** là một danh sách tích ô. Ô tích nằm bên trái để bấm được bằng ngón cái; bấm vào tên việc thì mở ra sửa.

```
[✓]  09:00  Trả lời tin nhắn khách              xong 09:09
     30p → 09:30 · ⚠ trùng giờ

[ ]  18:30  Tập gym                                    45p
     45p → 19:15 · 🔥 3
```

Xong rồi thì hàng **gạch ngang và mờ đi**, vẫn nằm nguyên chỗ cũ chứ không biến mất — biến mất thì mình tưởng bấm hụt. Cột phải cho biết đang ở đâu so với bây giờ: **xong 09:09** · **tới giờ** · **quá giờ** · hoặc thời lượng nếu chưa tới.

**Tích xong là Telegram im.** Việc hằng ngày đã tick thì hôm đó không bắn tin nữa; việc lẻ đã xong cũng vậy. Bấm ✅ dưới tin Telegram hay tích trong app đều ghi vào cùng một chỗ, kể cả giờ tick — nên tích ở đâu thì bên kia cũng thấy "xong 09:09".

Việc **lặp lại** tick xong thì hạn nhảy sang kỳ sau nhưng vẫn nằm lại trong ngày hôm nay với vệt gạch. Bấm ô tích lần nữa là **bỏ tích**: hạn trả về chỗ cũ, chuỗi 🔥 lùi một bước (kỷ lục thì giữ).

#### Kín, trống, và chồng giờ

Ngay dưới thanh ngày có một dòng tổng:

```
Kín 2h50    Trống 9h30    ⚠ 2 việc chồng giờ
[ 10:15 → 14:00  3h45 ]  [ 14:30 → 18:30  4h ]  [ 19:15 → 21:00  1h45 ]
```

- Mọi con số đo trong **cửa sổ làm việc** bạn đặt ở Cài đặt (mặc định **08:30 → 24:00**). **Kín + Trống luôn đúng bằng độ dài cửa sổ.**
- **Kín** đếm theo đồng hồ: hai việc chồng nhau chỉ tính một lần. Nên khi nó **nhỏ hơn** tổng số phút ở dòng tiêu đề, đó chính là dấu hiệu bạn đang nhét hai việc vào cùng một khoảng.
- Các thẻ bên dưới là những khoảng hở từ **30 phút** trở lên — kể cả đoạn đầu ngày (08:30 → việc đầu tiên) và đoạn cuối ngày (việc cuối → 24:00). Dưới 30 phút thì không làm được gì nên không kể ra.
- Việc rơi **ngoài cửa sổ** vẫn hiện trên trục và được nói ra thành một dòng riêng, chứ không lặng lẽ biến mất khỏi mọi con số.

#### Cửa sổ làm việc

Cài đặt → **Cửa sổ làm việc** → một hàng cho mỗi thứ:

```
T2  [08:30] – [24:00]   15h30  😴
T7  [08:00] – [12:00]   3h30   😴
CN  [      ] – [      ]  nghỉ   😴
```

Mốc kết thúc viết **24:00** nếu làm tới nửa đêm — viết `00:00` sẽ bị hiểu là đầu ngày. Bấm **😴** để đánh dấu ngày nghỉ; hôm đó app không tính kín/trống nữa mà chỉ nói *Ngày nghỉ*, và nếu vẫn còn việc xếp trong ngày thì nó nói ra.

**Đặt cả tuần theo T2** chép hàng T2 sang sáu thứ còn lại — nhanh hơn gõ bảy lần.

Một ô viết sai thì **không lưu gì cả**, kể cả những ô đúng: lưu được ba thứ rồi mới báo lỗi là kiểu tệ nhất, không ai biết đã lưu tới đâu.

Không có mốc này thì app chỉ đo được phần hở **giữa hai việc**, vì nó không biết bạn thức lúc mấy giờ. Có rồi thì mọi khoảng trống đều đo được, kể cả đầu ngày và cuối ngày.

Mốc này nằm trong cài đặt của máy nên **không** đi qua đồng bộ như các dữ liệu khác. App tự đẩy riêng cả bảng bảy thứ lên máy chủ mỗi lần lưu, để tin Telegram tính ra đúng con số như trên màn hình — hai nơi báo hai con số khác nhau cho cùng một ngày thì chẳng tin được cái nào.

#### Nhắc sắp hết ngày

Cột *quá giờ* trong app chỉ thấy khi bạn mở app. Nên đúng **22:00** (đổi được trong Cài đặt → Telegram → *Giờ nhắc sắp hết ngày*, `-1` để tắt) máy chủ điểm lại những việc còn chưa tick:

```
🌙 Sắp hết ngày — còn 3 việc · 1h50
   • 18:30 Tập gym · 45p
   • 21:00 Chốt sổ cuối ngày · 20p
   • Đi lấy hàng · ~45p (chưa xếp giờ)
Còn trống 2h40 tới 24:00.
```

**Lịch từ app khác không nằm trong danh sách này.** Nó không tick được ở đây nên nhắc cũng chẳng làm được gì, chỉ tổ đẩy con số *"còn N việc"* phồng lên. Nhưng nó vẫn chiếm giờ ở dòng *Còn trống* — giờ đó bận thật, chỉ là bận ở app bên kia.

**Tick xong hết thì không gửi gì.** Tin nhắc mà ngày nào cũng có, kể cả ngày bạn làm trọn vẹn, thì chỉ vài hôm là bị tắt. Dòng cuối tính từ *bây giờ* tới hết cửa sổ và đã trừ phần việc đã xếp giờ mà chưa làm — đó mới là chỗ thật sự còn nhét được. Ngày nghỉ thì bỏ dòng đó đi.

#### Lịch từ app khác

App khác của bạn (nhật ký giao dịch chẳng hạn) cũng có lịch cố định trong ngày: kiểm tra setup, dời SL, tổng kết tuần. Hai trục nằm hai nơi thì chẳng trục nào nói đúng được ngày của bạn.

**Cài đặt → Lịch từ app khác** nhận một file JSON do bên kia xuất ra. Những mốc đó lên trục cùng việc của mình, mang màu riêng, viền chấm chấm, và **tính vào Kín / Trống** — kể cả trong bản tóm tắt Telegram, để hai chỗ không bao giờ báo hai con số khác nhau.

Một chiều và chỉ đọc: khối lịch ngoài **không kéo được, không tick được** (biểu tượng 🔒). Bên kia mới là chủ của nó — sửa ở đây thì lần nhập sau là mất sạch. Muốn đổi thì đổi bên đó rồi nhập lại.

Định dạng file:

```json
{
  "feed": "nkgd",
  "name": "Nhật ký giao dịch",
  "color": "#d4a24e",
  "items": [
    { "title": "Kiểm tra setup", "time": "09:00", "mins": 30, "days": [1,2,3,4,5] },
    { "title": "Dời SL",         "time": "21:00", "mins": 5,  "days": [1,2,3,4,5] },
    { "title": "Tổng kết tuần",  "time": "20:00", "mins": 45, "date": "2026-08-22" }
  ]
}
```

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `feed` | không | tên mã cố định của nguồn; thiếu thì app tự lấy từ `name` |
| `name` | không | tên hiển thị; thiếu thì lấy `feed` |
| `color` | không | mã màu `#rrggbb` cho cả nguồn; mỗi mục cũng đặt riêng được |
| `items[].title` | có | tên việc |
| `items[].time` | có | giờ bắt đầu, 24 giờ, dạng `HH:MM` |
| `items[].days` | một trong hai | thứ lặp lại — `0` = CN, `1` = T2 … `6` = T7 |
| `items[].date` | một trong hai | việc một lần, dạng `YYYY-MM-DD` |
| `items[].mins` | không | dài bao lâu; thiếu thì tạm tính 15 phút |

#### Bản sao lưu của app Nhật ký giao dịch

App đó không có nút xuất riêng lịch, chỉ có nút **sao lưu toàn bộ**. Nhập thẳng file sao lưu đó cũng được: app nhận ra và tự rút lịch từ năm chỗ sinh ra mốc giờ trong file — lịch **dời SL**, lịch **kiểm tra setup**, nhóm **symbol theo dõi**, **nhắc điền nốt lệnh**, **tổng kết tuần**, cùng những **nhắc nhở riêng** đang bật gửi Telegram. Số phút lấy theo `taskDurations` của bên đó, kể cả số phút đặt riêng cho từng lịch.

Chỉ đọc tên, giờ, thứ và số phút. Lệnh, vốn, bài học — và nhất là **mã bot Telegram** nằm trong file — không được đụng tới và không vào cơ sở dữ liệu của app này.

> ⚠️ File sao lưu đó **có chứa mã bot Telegram và ID group** dưới dạng chữ thường. Đừng gửi nguyên file cho ai; nếu đã lỡ gửi thì vào **@BotFather → /revoke** để đổi mã.

Một điểm không đoán được: bên kia còn tự tắt mốc dời SL khi tài khoản không có lệnh nào đang mở. Ở đây không biết chuyện đó nên mốc vẫn hiện — thà thấy thừa còn hơn tưởng mình rảnh rồi nhận thêm việc.

Trên là dạng chuẩn, nhưng **app đọc rộng tay** — bên kia không viết riêng cho mình và mình cũng không sửa được file của nó, nên bắt bẻ từng chữ thì file nào cũng hỏng:

* Danh sách mục có thể là mảng trần ở gốc, hoặc nằm dưới `items`, `tasks`, `slots`, `timeline`, `events`, `schedule`, `list`, `rows`, `data`.
* Tên việc: `title`, `name`, `label`, `text`, `task`. Giờ: `time`, `hour`, `start`, `at`, `from`. Thời lượng: `mins`, `minutes`, `duration`, `len`, `dur`. Thứ: `days`, `weekdays`, `dow`, `repeat`.
* Giờ viết kiểu nào cũng nhận: `09:00`, `9:00`, `9h30`, `0900`, `9`, `9:00 PM`, hay số `930`.
* Thứ viết kiểu nào cũng nhận: `1`, `"T2"`, `"Mon"`, `"Monday"`, `"daily"` (cả tuần), `"weekday"` (T2–T6).
* Thời lượng viết `"30p"` hay `"30 phút"` cũng ra 30.
* `day` thì app tự đoán: `"2026-08-22"` là ngày, `"T3"` là thứ.
* Một mục mang cả mảng `hours` thay vì một `time` thì được tách thành nhiều mốc.

**Nhập lại cùng một `feed` là thay hẳn bản cũ** — bên kia cứ xuất trọn bộ mỗi lần, không cần tính xem cái gì đã đổi. Nếu `feed` để trống thì mã được lấy từ `name`, nên **giữ `name` cố định** là đủ.

Mục nào thiếu tên, thiếu giờ, hoặc không có `days` lẫn `date` thì bị bỏ, và app nói rõ **mục thứ mấy hỏng vì sao** chứ không lặng lẽ nuốt. Không thấy danh sách mục nào thì app kể ra những trường file đang có, để gửi lại cho bên kia là biết ngay phải sửa gì.

Nguồn nào **quá 10 ngày** chưa nhập lại thì màn Việc hằng ngày hiện một dòng cam nhắc: bên đó đổi lịch mà mình không biết thì con số "còn trống" đang nói dối.

Không có nút **Chọn file** trên máy bạn thì dùng **Dán nội dung** — chép nguyên văn file JSON vào một ô là được. Nút **Mẫu file** cho ra đúng khối trên để gửi cho app bên kia.

#### Lịch đổi liên tục thì thay thế nào

Mỗi nguồn đã nhập có ba nút:

* **⟳ Thay** — chọn file mới, mốc cũ của nguồn đó bị bỏ hết. Khác với **+ Thêm lịch** ở chỗ: nếu file mới mang **mã nguồn khác** (bên kia đổi tên, hay đổi từ bản sao lưu sang bản xuất riêng) thì mã cũ cũng bị dọn luôn, không để lại một lịch ma trên trục. Không phải xoá trước rồi nhập lại.
* **⌨** — cùng việc đó nhưng dán nội dung thay vì chọn file, tiện trên điện thoại.
* **✕** — bỏ hẳn nguồn này.

Từ hai nguồn trở lên thì có thêm nút **Xoá hết**.

### Ý tưởng

Màn riêng ở thanh bên — **💡 Ý tưởng** — chứ không nằm sau một tab của Công việc. Ý tưởng là chỗ nghĩ dài hạn, phải mở được bằng một cú bấm.

Nội dung và hướng triển khai tách riêng, có nút đưa thẳng lên bảng giao việc. Ba nhóm:

| Nhóm | Gồm |
|---|---|
| **Đang nuôi** | mọi thứ chưa xong và chưa gác — mở màn là thấy nhóm này |
| **Đang triển khai** | riêng những ý tưởng đã bắt tay làm |
| **Kho** | đã xong và tạm gác, cất đi cho danh sách chính gọn |

Con số trên thanh bên đếm số ý tưởng **đang triển khai** — tức là những thứ bạn đã cam kết làm, không phải mọi thứ từng nghĩ ra. Khi có ý tưởng tới hẹn xem lại thì con số đó nhường chỗ cho số ý tưởng đang chờ bạn quyết.

#### Hẹn ngày xem lại

Ý tưởng khác việc ở chỗ nó **không có hạn** — nên nó chìm. Bạn ghi "mở lớp tập nhóm buổi sáng" vào tháng Ba, tháng Chín mở ra vẫn thấy nó nằm đó y nguyên, không ai hỏi han gì.

Trong ô sửa ý tưởng có mục **Nhắc xem lại**: sau 1 tháng / 3 tháng / 6 tháng / 1 năm. Tới ngày đó Telegram nhắn cho bạn kèm nội dung và hướng triển khai đã ghi, rồi hỏi thẳng:

```
💡 Thẻ thành viên tích điểm chung 2 tiệm
Tới hẹn xem lại — hẹn từ 09/08

Chị Linh bên cạnh cũng muốn làm chung.

Hướng triển khai
Cần bàn lại chuyện chia doanh thu.

Làm hay bỏ?
[ ▶ Triển khai | 🗄 Gác lại ]
[ ⏰ Nhắc lại sau 3 tháng ]
```

- **Triển khai** → chuyển sang trạng thái *Đang triển khai*, xoá ngày hẹn.
- **Gác lại** → chuyển sang *Tạm gác*, vào Kho, xoá ngày hẹn.
- **Nhắc lại sau 3 tháng** → hẹn tiếp, trạng thái giữ nguyên. Tới mốc mới lại hỏi.

Ba nút đó cũng nằm ngay trên thẻ ý tưởng trong app, ở mục **Cần xem lại** trên đầu danh sách. Bấm bên nào cũng ghi vào cùng một chỗ.

Sửa ý tưởng đang có hẹn thì ô này hiện sẵn *"Giữ ngày 18/11/2026"* — đổi tên hay sửa nội dung sẽ không vô tình đặt lại ngày hẹn.

**Giờ hỏi** mặc định là 9h sáng, đổi trong Cài đặt → Telegram → *Giờ hỏi lại ý tưởng* (đặt `-1` để tắt hẳn). Ý tưởng trễ hẹn mấy hôm vẫn được hỏi chứ không bị bỏ qua như lời nhắc theo giờ — câu hỏi "làm hay bỏ" thì muộn vài hôm vẫn còn nguyên giá trị.

### Hành trình phát triển

Nhật ký bài học. Hai loại ghi, cùng kết ở một chỗ.

**⚠ Lỗi lầm** — sáu ô, đi từ chuyện đã xảy ra tới thứ rút ra được:

| Ô | Để làm gì |
|---|---|
| Lỗi lầm hôm đó | một câu gọi tên chuyện đã hỏng |
| Mô tả sự việc | diễn biến |
| Người ảnh hưởng | ai chịu hậu quả — khách, nhân viên, đối tác |
| Vấn đề cốt lõi | không phải *ai làm sai*, mà *vì sao chuyện này xảy ra được* |
| Cách khắc phục | chữa lần này, và chặn lần sau |
| Bài học rút ra | câu để đọc lại sau nửa năm |

**💡 Bài học** — gọn hơn, cho những ngày không hỏng gì mà vẫn học được điều gì đó: tên, kinh nghiệm hôm nay, và bài học tổng.

#### Gốc vấn đề — thứ biến cuốn nhật ký thành cái gương

Mỗi mục có thêm ô **Gốc vấn đề**, và **chọn được nhiều** — một chuyện hỏng thường có mấy yếu tố cùng góp vào (cầu toàn *cộng* nóng vội *cộng* không hiểu cảm xúc người kia). Ép chọn đúng một cái "chính" thì mấy cái kia biến mất khỏi thống kê, mà chúng mới là thứ đáng đếm.

Ô này là **một dãy nút bấm**: mọi gốc bạn từng dùng, rồi tới gợi ý sẵn. Gốc chưa có thì gõ vào ô bên dưới, cách nhau bằng dấu phẩy — gõ xong nó tự thành nút cho lần sau. Chữ được chuẩn hoá về chữ thường và bỏ khoảng trắng thừa, nên `Cầu Toàn ` và `cầu toàn` được đếm là một.

Cái nhãn đó để làm một việc: gom lại. Đọc từng mục riêng lẻ thì mục nào cũng có vẻ là chuyện riêng của hôm đó. Gom theo gốc mới thấy cùng một chuyện đang quay lại lần thứ ba. Đầu mục Hành trình có khối **Gốc lặp lại** liệt kê mọi gốc đã gặp **từ 2 lần trở lên** (gốc nào cũng đúng một lần thì chẳng nói lên điều gì) — bấm vào một nhãn là lọc còn đúng những mục cùng gốc, kể cả mục mang nhiều gốc.

Trên thẻ, **mỗi gốc một nhãn riêng**, và mỗi nhãn mang số lần của riêng nó: cùng một chuyện có thể là *lần 3* của `cầu toàn` mà mới là *lần 1* của `nóng vội`. Từ 3 lần trở lên nhãn chuyển sang màu đỏ.

Mục ghi từ bản trước — kể cả khi bạn đã gõ mấy gốc ngăn bằng dấu phẩy vào một ô — được tách ra đúng như vậy, không mất gì.

#### Nối với danh bạ

Ô **Ảnh hưởng tới** vẫn là chữ tự do (khách, đối tác, ai cũng ghi được). Bên dưới có thêm ô chọn **người trong danh bạ**. Chọn ai thì trang của người đó hiện khối **Hành trình liên quan** — mở trang một người là thấy luôn những chuyện bạn đã ghi có dính tới họ, thứ mà lúc chuẩn bị gặp lại rất cần nhớ. Hai nửa của app (quan hệ và nhật ký bài học) vốn chạy song song; đây là chỗ nối chúng lại.

Thẻ trong danh sách chỉ giữ **tên chuyện và bài học** — hai thứ đọc lướt được. Diễn biến đầy đủ nằm sau một lần chạm (**Xem đầy đủ · N phần**), mở ra một khung *chỉ đọc*, có nút ✎ Sửa nếu muốn sửa thật. Mười lăm mục mà mục nào cũng trải hết bốn đoạn thì cuộn cả buổi không hết, mà chín trên mười lần mở mục này ra là để ôn lại bài học chứ không phải đọc lại diễn biến. Mục nào chưa ghi diễn biến thì không có dòng *Xem đầy đủ* — thẻ đã hiện đủ rồi.

Thẻ lỗi lầm có vạch đỏ bên trái, bài học vạch xanh. Danh sách gom theo tháng, mới nhất lên trước. Ba tab **Tất cả · Lỗi lầm · Bài học**, và lọc được theo mảng việc như mọi màn khác.

Đổi loại về sau vẫn được — ô *Loại* nằm cuối biểu mẫu. Dữ liệu của những ô không hiện ở loại kia **không bị mất**, nên đổi qua đổi lại không mất gì.

Tìm kiếm đọc cả sáu ô, nên gõ *"kho"* hay *"hứa ngày giao"* đều ra đúng mục.

### Giao việc
Bốn cột: **Lên ý tưởng → Đã giao việc → Đang làm → Hoàn thành**. Mỗi thẻ có nút chuyển cột ngay trên thẻ. Dưới bảng là tiến độ theo từng người.

**Việc ngoài luồng.** Trong thẻ có ô *Loại việc* — chọn "Ngoài luồng — cần chi thêm" cho những việc giao ngoài nhiệm vụ thường ngày, kèm số tiền công hoặc thưởng dự tính. Thẻ sẽ mang nhãn ⌁ vàng trên bảng, chuyển xanh khi đã trả.

Bên dưới bảng có khối **Việc ngoài luồng · tiền cần chi thêm**: tổng chưa trả / đã trả, gom theo từng người, tick ô vuông khi đã đưa tiền, hoặc bấm *Trả hết* để chốt một lần cho cả người đó. Số còn nợ cũng hiện trong *Ôn lại tuần* để cuối tuần không quên thanh toán.

Cơ chế giống hệt sổ ân tình bên Quan hệ, chỉ khác là với nhân viên.

### Hồ sơ nhân viên
Cài đặt → Nhân sự, hoặc chạm tên người trong khối *Tiến độ theo người* dưới bảng. Mỗi nhân sự có: vai trò, **mảng việc phụ trách** (chọn được nhiều), điện thoại, **sinh nhật**, ngày vào làm, ghi chú riêng.

Sinh nhật nhân viên hiện chung với sinh nhật người quen ở màn Tổng quan, trên lịch tháng, và trong bản tóm tắt gửi Telegram — có nhãn *(nhân viên)* để bạn biết đường chuẩn bị quà.

Trang hồ sơ gom lại: tổng việc / đang làm / đã xong / đang trễ, tỉ lệ hoàn thành, **tỉ lệ xong đúng hạn**, toàn bộ tiền ngoài luồng đã và chưa trả, và danh sách việc nhóm theo cột. Có nút giao việc thẳng cho người đó.

Hai điều về cách tính:
- *Đúng hạn* chỉ chấm trên những thẻ có **cả hạn chót lẫn mốc hoàn thành** (mốc này được ghi khi bạn chuyển thẻ sang cột Hoàn thành trong app). Thẻ cũ nhập tay không có mốc thì không bị tính, và app nói rõ "chưa đủ dữ liệu" thay vì đưa ra con số sai.
- Thẻ việc gắn với nhân viên **theo tên**. Đổi tên trong hồ sơ thì app tự cập nhật tất cả thẻ cũ, nhưng nếu bạn sửa tên bằng cách xoá rồi tạo lại thì các thẻ cũ sẽ mồ côi.

### Sổ tiền
Gom mọi khoản tiền đã ghi rải rác trong app về một dòng chảy theo tháng:

- **Chi** — quà mình tặng, món trả lại trong sổ ân tình, và tiền ngoài luồng đã trả cho nhân viên.
- **Nhận** — quà người khác trao mình (không phải tiền mặt, chỉ để đối chiếu đang nợ hay dư).

Có biểu đồ 12 tháng (phần tím là quan hệ, xanh là nhân viên — chạm cột để nhảy tới tháng đó), so với tháng trước và **so với cùng kỳ năm ngoái**.

Phần đáng giá nhất là **Chi theo dịp trong năm**: ví dụ *"Tết · 3 người · trung bình 1,9tr · tổng 5,8tr"*. Trước Tết mở ra là biết năm ngoái tiêu bao nhiêu để đặt ngân sách, thay vì tiêu tới đâu hay tới đó.

### Hộp ghi nhanh
Nút ✎ trên thanh đầu, hoặc <kbd>Ctrl/Cmd</kbd> + <kbd>J</kbd>. Một ô duy nhất: gõ một câu (hoặc bấm 🎤 nói) rồi <kbd>Enter</kbd> là xong — không phải chọn mảng, hạn hay loại. **Lưu & ghi tiếp** giữ ô mở để trút liền mấy ý.

Lúc rảnh vào *Hộp ghi nhanh* đẩy từng mẩu về đúng chỗ, mỗi mẩu một hàng nút:

| Chuyển thành | Nhận được gì |
|---|---|
| **Việc** | dòng đầu thành tên việc, phần còn lại thành ghi chú |
| **Ý tưởng** | dòng đầu thành tên, phần còn lại thành nội dung |
| **Giao việc** | thành thẻ ở cột Lên ý tưởng |
| **Nhật ký** | chọn người, cả mẩu thành một dòng nhật ký gặp gỡ, tự cập nhật ngày liên lạc |

Mẩu nào không cần chuyển thì bấm *Xong, khỏi chuyển*. Số mẩu chờ hiện thành huy hiệu ở thanh bên và một khối nhắc trên Tổng quan, để hộp không bị bỏ quên.

Lý do có màn này: ma sát lúc nhập là chỗ các app kiểu này chết. Nghĩ ra ý tưởng lúc đang lái xe mà phải mở form chọn năm thứ thì thà không ghi — rồi quên luôn.

### Lịch tháng
Việc đến hạn, thẻ giao việc, dịp lễ và sinh nhật nằm chung trên một lưới lịch, tuần bắt đầu từ Thứ 2. Mỗi ô có **số ngày âm** nhỏ bên cạnh ngày dương.

Việc lặp lại được **chiếu tới trước** trong tháng đang xem — nhìn là biết tuần sau có gì, dù bạn mới chỉ tạo nó một lần. Các kỳ lặp tương lai hiển thị mờ hơn để phân biệt với kỳ hiện tại.

Ô hẹp nên chỗ hiển thị có hạn: dịp và sinh nhật luôn được xếp lên trước, việc lặp hằng ngày xuống sau, để thứ quan trọng không bị đẩy khuất. Trên điện thoại mỗi ô rút gọn thành các chấm màu theo mảng.

Chạm một ngày để xem đầy đủ bên dưới, và có nút thêm việc thẳng vào đúng ngày đó.

**Tick xong việc ngay trên lịch.** Việc thường tick là xong; việc lặp tick là hoàn thành kỳ hiện tại (hạn nhảy sang kỳ sau, chuỗi 🔥 +1); thẻ giao việc tick là chuyển thẳng sang cột Hoàn thành, bỏ tick thì quay lại Đang làm.

Hai trường hợp cố ý **không** có ô tick, để tránh làm hỏng chuỗi và ngày hạn:
- *Kỳ lặp sắp tới* (ví dụ buổi gym của thứ Tư khi hôm nay mới thứ Hai) — chỉ hiện chấm màu.
- *Buổi đã làm xong trong quá khứ* — đây là bản ghi lịch sử, không phải việc đang chờ.

Nhờ bản ghi lịch sử đó, lịch cho thấy cả những buổi bạn **đã thật sự làm** chứ không chỉ kế hoạch sắp tới — nhìn lại tháng là biết mình tập được bao nhiêu buổi.

### Dịp & lễ
Giỗ, Tết, kỷ niệm cưới, 20/11… lặp lại mỗi năm. Chọn **âm lịch** cho giỗ và Tết — app tự quy ra ngày dương từng năm bằng thuật toán âm lịch Việt Nam (múi giờ +7), không cần nhập lại hằng năm.

Có sẵn 15 lễ Việt thường gặp để thêm bằng một chạm. Mỗi dịp gắn được nhiều người, và với mỗi người app **gợi ý mức quà**:

1. Đã từng tặng người đó vào đúng dịp này → lấy mức lần trước.
2. Chưa từng → lấy trung bình bạn đã tặng người đó.
3. Chưa tặng bao giờ → mức mặc định theo nhóm (S 1tr · A 700k · B 400k · C 200k).
4. Nếu đang **nợ ân tình** nhiều hơn mức trên → nâng lên cho bằng phần đang nợ.

Số cuối được làm tròn cho đẹp và luôn kèm lý do ("lần trước tặng 500k", "đang nợ 950k ân tình") — nó gợi ý chứ không quyết thay bạn.

### Ôn lại tuần
Bảy ngày qua: việc đã xong, việc đang trễ, ai đã hỏi thăm, ai đang bị bỏ quên, còn nợ ân tình ai — kèm ba câu tự vấn.

**Cân bằng giữa các mảng** — thanh phân bổ cho thấy 7 ngày qua bạn dồn sức vào đâu, tính bằng "lượt chạm": việc hoàn thành + thẻ giao việc động tới + nhật ký gặp gỡ với người thuộc mảng đó. Mảng nào còn việc đang mở mà cả tuần không đụng tới sẽ bị gắn cờ đỏ. Đây là chỗ để phát hiện "cả tuần chỉ lo Barbershop, Gym bỏ không".

---

## Tìm kiếm toàn cục

Nút 🔍 trên thanh đầu, hoặc phím tắt <kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd>. Tìm xuyên **người, việc, ý tưởng, thẻ giao việc, dịp lễ và cả sổ trao đổi**, kết quả gom theo nhóm, Enter để nhảy vào kết quả đầu.

Tìm **không dấu vẫn ra**: gõ `tuan` ra "Trần Minh Tuấn", `do my linh` ra "Đỗ Mỹ Linh", `tet` ra Tết Nguyên Đán và các món quà Tết. Nội dung nhật ký gặp gỡ cũng được tìm — gõ `xuong` là ra người mà bạn từng ghi "đang tính mở xưởng".

## Mảng việc (tag)

Tạo trong thanh bên: Gym, Barbershop, Kinh doanh online, Cá nhân… Gán cho việc, ý tưởng, thẻ giao việc và cả người. Bấm vào một mảng ở thanh bên là **lọc toàn bộ** Tổng quan / Công việc / Giao việc theo mảng đó.

Riêng màn Quan hệ không bị lọc — bốn vòng tròn luôn hiện đủ, vì quan hệ không thuộc về mảng kinh doanh nào. Mảng của một người vẫn hiện trên thẻ và tìm kiếm được.

---

## Ghi bằng giọng nói

Ô nhật ký gặp gỡ, ghi chú người, mô tả ý tưởng và mô tả thẻ việc đều có nút 🎤. Bấm rồi nói tiếng Việt, chữ chạy thẳng vào ô; bấm ■ để dừng. Vừa rời quán cà phê, đọc 10 giây là xong một dòng nhật ký.

Dùng Web Speech API có sẵn của trình duyệt: Chrome, Edge, Safari mới đều chạy; Firefox chưa hỗ trợ nên nút tự ẩn. Lần đầu trình duyệt sẽ hỏi quyền micro. Nhận dạng chạy qua dịch vụ của trình duyệt (với Chrome là máy chủ Google) — nếu bạn ngại điều đó thì cứ gõ tay như bình thường.

## Thông báo nhắc nhở

Cài đặt → Nhắc nhở → Bật, chọn giờ. Mỗi ngày một thông báo tóm tắt: việc đến hạn, **dịp sắp tới**, sinh nhật, việc giao trễ, người lâu chưa hỏi thăm.

**Giới hạn cần biết:** đây là thông báo cục bộ, không có máy chủ đẩy. Nó chỉ bắn khi app đang mở hoặc đang chạy nền. Nếu cả ngày không mở app thì sẽ không có thông báo — mở ra là thấy đủ trong màn Tổng quan. Trên iPhone bắt buộc phải “Thêm vào Màn hình chính” trước.

---

## Thông báo Telegram

Khác hẳn thông báo trong máy: cái này do **máy chủ** gửi, nên tin vẫn tới kể cả khi bạn đã tắt app, tắt trình duyệt, tắt máy. Cần cài `api/` theo mục trên trước.

### Cài lần đầu

**1. Tạo bot**

Nhắn **@BotFather** trên Telegram → `/newbot` → đặt tên → chép mã bot (dạng `123456:AAE…`).

**2. Cho bot vào group**

Thêm bot vào group của bạn và cho quyền gửi tin. Nếu group có bật **Topics** (nhánh), vào đúng nhánh bạn muốn nhận tin rồi **nhắn một câu bất kỳ** — bước này quan trọng, vì bot chỉ "nhìn thấy" group sau khi có tin nhắn.

**3. Nối vào app**

Cài đặt → Thông báo Telegram → **Cài đặt**:

- Dán mã bot
- Bấm **Dò group** — app tự điền ID group và số nhánh
- Chọn giờ gửi bản tóm tắt hằng ngày (để trống thì không gửi)
- Chọn giờ gửi **bảng công việc**
- Điền **bốn ô nhánh** nếu muốn tách tin ra từng nhánh (xem ngay dưới đây)
- Bấm **Gửi thử** để chắc tin vào đúng nhánh
- **Lưu cấu hình**

**Năm nhánh riêng cho năm loại tin.** Trộn hết vào một nhánh thì một bản báo cáo dài đẩy trôi mất mấy lời nhắc ngắn. Năm ô trong Cài đặt chia như sau:

| Ô | Tin nào đi vào đây |
|---|---|
| **Việc cần làm** | nhắc riêng từng việc của mình, báo trễ leo thang của việc mình |
| **Giao việc** | nhắc riêng từng thẻ giao việc, báo trễ leo thang của thẻ |
| **Nhắc lặp lại** | gym, uống thuốc, chốt sổ… — trừ lời nhắc nào tự đặt nhánh riêng cho nó |
| **Ý tưởng** | câu hỏi "làm hay bỏ" khi một ý tưởng tới hẹn xem lại |
| **Báo cáo** | tóm tắt hằng ngày, bảng công việc, tóm tắt tuần |

Ô nào để trống thì tin đi vào nhánh mặc định. Muốn biết ID nhánh: nhắn một câu vào **từng nhánh** trong group rồi bấm **Dò group** — app liệt kê hết các nhánh bot nhìn thấy kèm tên, chép số vào ô tương ứng.

**4. Hẹn giờ cho máy chủ — đừng bỏ bước này**

Vào hPanel → **Cron Jobs**, tạo lịch chạy **mỗi 5 phút** với lệnh app hiện sẵn trong Cài đặt:

```
/usr/bin/php /home/uXXXXXXXX/public_html/api/cron.php
```

Gói hosting nào chỉ cho gọi bằng đường link thì dùng địa chỉ `cron.php?key=…`, cũng hiện ngay bên dưới lệnh đó.

Chưa làm bước 4 thì lời nhắc vẫn hiện đầy đủ trong app nhưng **sẽ không có tin nào chạy vào Telegram**.

### App không hỏi mật khẩu — kiểm thế nào

Nếu mở trang mà vào thẳng, không thấy màn hình đăng nhập, thì máy chủ chưa nối được. App sẽ tự nói ra bằng một trong hai cách:

- **Thanh đỏ ở cuối màn hình** *"Đang chạy KHÔNG có đăng nhập"* → bấm **Vì sao?** để xem lý do cụ thể.
- **Màn hình đăng nhập kèm dòng báo lỗi** → lý do nằm ngay dưới ô mật khẩu.

Kiểm nhanh bằng tay: mở `https://tenmien-cua-ban.com/api/index.php` trên một tab mới.

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| `{"ok":false,"error":"Chỉ nhận POST"}` | PHP chạy tốt, API ổn | lỗi nằm chỗ khác — xem thanh báo trong app |
| Trang lỗi **404** | thư mục `api/` chưa lên máy chủ | kiểm tra deploy Git đã kéo đủ chưa |
| Hiện ra **mã PHP** | hosting chưa chạy PHP | hPanel → PHP Configuration, bật PHP cho tên miền |
| `{"ok":false,"error":"Chưa có api/config.php…"}` | thiếu file cấu hình | làm bước 3 ở trên |

Nếu app vẫn kẹt ở bản cũ dù đã push code mới: xoá dữ liệu duyệt web của riêng trang đó — thao tác này gỡ luôn service worker cũ.

### Nhắc lặp lại theo thứ và giờ

Màn **🔁 Việc hằng ngày** → tab **Tất cả** → **+ Thêm**. Mỗi việc gồm: nội dung, giờ, **số phút**, những thứ trong tuần, mảng việc, nhánh riêng (nếu muốn tin này vào nhánh khác), và ghi chú thêm.

Bản tóm tắt sáng mở đầu bằng **hình dạng của ngày** — biết ngày dồn chỗ nào lúc 7h sáng thì còn dời được, biết lúc 18h30 thì chỉ còn bực:

```
🗓 Hôm nay 5 việc theo giờ · 3h05
   Cửa sổ 08:30–24:00 · kín 2h50 · trống 12h40
   ⚠️ 2 việc chồng giờ
   Còn rảnh: 08:30–09:00, 10:15–14:00, 14:30–18:30…
```

Dòng này gộp cả việc hằng ngày lẫn việc lẻ đến hạn đã có giờ, đúng như tab **Hôm nay** trong app. Không có việc nào theo giờ thì không thêm dòng thừa. Nó nằm trong bản tóm tắt hằng ngày, nên cần bật **Giờ gửi tóm tắt** trong Cài đặt → Telegram.

Đúng ví dụ bạn nói: *Tập gym · T2·T3·T5·T6·T7 · 18:30* — app hiển thị gọn thành `T2 · T3 · T5 · T6 · T7 lúc 18:30`. Chọn cả 7 thứ thì nó rút thành "hằng ngày", chọn T2→T6 thì thành "thứ 2 → thứ 6".

Nút ➤ bên phải mỗi dòng gửi thử ngay lập tức. Ô vuông bên trái bật/tắt nhanh mà không cần mở ra sửa.

**Nút "✅ Xong hôm nay".** Sau khi bật nút bấm (xem phần dưới), mỗi tin nhắc lặp lại kèm một nút — tập xong bấm một cái là hệ thống ghi lại, không cần mở app:

```
🔔 Tập gym
18:30 · 45p

mang găng tay

[ ✅ Xong hôm nay ]
```

Trong app, mỗi dòng nhắc có nút ✓ tương ứng, một chuỗi 🔥 đếm số kỳ liên tiếp, và **dải bảy ngày gần nhất** để thấy ngay mình đang đều hay đang đứt:

```
Tập gym
hằng ngày · 45p · hôm nay 18:30 · 🔥 3
● ● ○ ● ● ● ●     ← ● xong · ○ bỏ lỡ · · không phải ngày tập
```

Nút ➤ **Gửi thử ngay** cạnh mỗi dòng gửi đúng tin thật, kèm cả nút bấm — dùng để thử mà không phải ngồi chờ tới giờ.

Đã tick xong hôm nay thì **hôm đó không nhắc nữa** — tập gym xong lúc 6h sáng mà 18h30 vẫn bị nhắc thì lần sau người ta tắt luôn cái app. Chuỗi 🔥 chỉ đứt khi bỏ lỡ một kỳ **đã qua**; hôm nay chưa tick thì chưa tính là đứt, ngày còn chưa hết.

**Về giờ giấc:** máy chủ tính theo giờ Việt Nam. Cron chạy 5 phút một lần nên lời nhắc đặt 18:30 sẽ tới trong khoảng 18:30–18:35. Nếu máy chủ trục trặc và trễ **quá một tiếng** thì app bỏ luôn lần đó chứ không gửi muộn — nhắc "tập gym 18:30" vào lúc 22h chỉ gây khó chịu. Mỗi lời nhắc chỉ gửi một lần mỗi ngày, cron chạy lại bao nhiêu lần cũng không gửi trùng.

### Thông báo cho mục Công việc

Hai thứ khác nhau, dùng chung hay riêng đều được.

**Bảng công việc hằng ngày.** Cài đặt → Thông báo Telegram → ô *Giờ gửi bảng công việc*. Mỗi ngày một tin, xếp theo mức gấp:

```
🗂 Công việc · 16/08/2026

🔴 Trễ hạn (1)
   • Nộp báo cáo quý ❗ — trễ 3 ngày

📌 Hôm nay (1)
   • Gọi nhà cung cấp (14:45)

🗓 Vài ngày tới
   • Chuẩn bị họp — còn 2 ngày

👥 Việc đã giao
   • Thiết kế banner — Lan (trễ 3 ngày)
   • Chạy ads Shopee — Minh (hạn hôm nay)
```

Tin này thuộc nhóm **báo cáo**, nên nó đi vào ô nhánh *Báo cáo*. Không có việc nào đang treo thì không gửi tin trống. Nút **Gửi bảng công việc ngay** ở màn Cài đặt gửi thử bất cứ lúc nào mà không phải chờ tới giờ.

Bật bảng này thì bản tóm tắt hằng ngày **tự bỏ** khối việc đến hạn và dòng việc giao trễ, để bạn không đọc cùng một danh sách hai lần trong một buổi sáng. Tắt đi thì nó nhận lại như cũ.

**Báo trước hạn.** Cạnh ô giờ có ô **Báo trước (ngày)**. Để `0` thì chỉ nhắc đúng ngày hạn như thường. Điền `3` thì có thêm **một** tin sớm ba hôm trước — một cú hích, không phải càu nhàu mỗi sáng suốt ba ngày:

```
⏳ Nộp hồ sơ thuế
Còn 3 ngày — hạn 20/08 · 09:00
```

Đúng ngày hạn vẫn có tin thứ hai như bình thường. Dùng cho việc lớn cần chuẩn bị: hồ sơ, đơn hàng, hợp đồng.

**Nhắc riêng từng đầu việc.** Mở một việc (hoặc một thẻ giao việc) → ô **Nhắn Telegram lúc**. Đúng ngày hạn, vào giờ đó, máy chủ đẩy riêng một tin cho việc ấy:

```
✓ Gọi nhà cung cấp
Hạn hôm nay · 14:45
```

Thẻ giao việc thì kèm luôn tên người nhận. Việc đã đánh dấu xong, hoặc hạn không phải hôm nay, thì không nhắn. Trong danh sách, việc nào có hẹn giờ sẽ mang nhãn 🔔 kèm giờ.

Cùng quy tắc giờ giấc như lời nhắc lặp lại: cron 5 phút một nhịp nên tin tới trong khoảng 5 phút sau giờ hẹn, trễ quá một tiếng thì bỏ lần đó, và mỗi việc chỉ nhắn một lần mỗi ngày. Việc lặp lại thì hạn tự dời sang kỳ sau khi bạn đánh dấu xong, nên giờ nhắc theo luôn mà không cần đặt lại.

**Đặt giờ mà không thấy tin — bấm "Vì sao chưa gửi?"** Nút này ở Cài đặt → Thông báo Telegram, hỏi thẳng máy chủ xem nó đang thấy gì:

- **Giờ máy chủ** và **cron chạy lần cuối cách đây bao lâu**. Quá 20 phút là cron đã ngừng — đó là nguyên nhân phổ biến nhất.
- Từng đầu việc có hẹn giờ, kèm lý do cụ thể: *chưa tới giờ — còn 8 phút*, *hạn 17/08 không phải hôm nay*, *chưa đặt hạn*, *đã đánh dấu xong*, *đã gửi rồi*, *quá 1 tiếng so với giờ hẹn*, *đã dời — còn 240 phút*.
- Nếu bảng trống hoàn toàn → máy chủ **chưa nhận được** dữ liệu bạn vừa đặt, bấm **Đồng bộ ngay** ở mục Tài khoản.

Bảng này chỉ đọc, không gửi gì cả, nên bấm bao nhiêu lần cũng được.

**Báo trễ leo thang.** Cài đặt → Thông báo Telegram → bật *Báo trễ leo thang*. Việc (hoặc thẻ giao việc) nào trễ đúng **3, 7, 14 hoặc 30 ngày** sẽ có một tin riêng, tách khỏi bảng công việc hằng ngày:

```
🆘 Trễ 7 ngày: Nộp báo cáo quý
```

Mỗi mốc chỉ báo đúng một lần cho mỗi việc — không nhắc lại mỗi ngày, vì việc đó vẫn nằm sẵn trong bảng công việc rồi. Tắt tính năng này thì việc trễ chỉ còn hiện trong bảng công việc như bình thường.

**Nút bấm ngay dưới tin nhắn.** Cài đặt → Thông báo Telegram → **Bật nút bấm**. Từ đó, các tin nhắc riêng từng đầu việc (và tin báo trễ leo thang) có thêm một hàng nút — xử lý ngay trong Telegram, không cần mở app:

```
✓ Gọi nhà cung cấp
Hạn hôm nay · 14:45

[         ✅ Xong         ]
[ ⏰ 4 giờ  |  ⏰ 12 giờ  ]
[ ⏰ 1 ngày |  ⏰ 3 ngày  ]
```

Các mức dời xếp **hai nút một hàng** chứ không phải bốn: bốn nút một hàng nhìn trên máy tính thì vừa, nhưng trên điện thoại bị bóp đến mức nhãn xuống dòng, chữ chồng lên nhau và rất dễ bấm nhầm mức.

Lời nhắc lặp lại thì có nút **✅ Xong hôm nay** thay cho bộ nút trên.

**Việc lặp lại bấm Xong là xong kỳ này, không phải xong hẳn.** Y như tick trong app: hạn nhảy sang kỳ sau, chuỗi 🔥 cộng thêm một, và Telegram trả lời *"Xong kỳ này · lần tới 18/08 · chuỗi 5 🔥"*. Bỏ lỡ nhiều kỳ thì hạn nhảy thẳng tới mốc tương lai gần nhất chứ không dồn lại.

Cần tên miền chạy **https** (Telegram không gọi ngược về địa chỉ http). Khi bấm nút: máy chủ ghi thẳng vào cơ sở dữ liệu, trả lời bằng một thông báo nhỏ ("Đã đánh dấu xong ✓" / "Đã dời tới 18:03 17/08"), và sửa lại tin nhắn gốc để bạn biết đã bấm rồi. Chỉ nút bấm từ đúng group đã cấu hình mới có tác dụng, người khác có link webhook cũng không đụng được vào dữ liệu của bạn.

### Ghi nhanh thẳng từ Telegram

Sau khi bật nút bấm, nhắn vào group:

```
/ghi mua thêm dầu gội
```

là có ngay một mẩu trong **Hộp ghi nhanh**, khỏi mở app. Bot trả lời xác nhận ngay trong nhánh bạn vừa nhắn. Mở app lúc nào cũng thấy, phân loại sau thành việc / người / ý tưởng như mọi mẩu khác.

Gõ dấu **/** trong group là Telegram hiện sẵn danh sách lệnh. `/help` xem lại cách dùng. Gõ nhầm lệnh khác (kể cả lệnh có dấu tiếng Việt như `/tìm việc`) thì bot trả lời hướng dẫn chứ không im lặng.

Muốn gõ gọn hơn bằng dấu **+** (`+ gọi anh Tuấn`) thì phải tắt privacy mode: nhắn **@BotFather** → **/setprivacy** → chọn bot → **Disable**. Lý do: mặc định Telegram chỉ cho bot nhìn thấy tin bắt đầu bằng dấu `/`, nên `/ghi` lúc nào cũng chạy còn `+` thì không. Tin nhắn thường trong group không bị đụng tới — chỉ hai cú pháp này mới tạo mẩu.

**Nhắn `/ghi` mà không thấy gì?** Bấm nút cùng tên ở Cài đặt → Thông báo Telegram. Nó hỏi thẳng Telegram xem webhook đang đăng ký thế nào:

- **Nhận tin nhắn (cho `/ghi`): KHÔNG** → webhook đăng ký từ trước bản cập nhật này. Bấm **Tắt nút bấm** rồi **Bật nút bấm** lại là xong. Đây là nguyên nhân hay gặp nhất.
- **Lỗi gần nhất** → Telegram có gọi về nhưng máy chủ trả lời hỏng.
- Mọi thứ đều "có" mà vẫn không chạy → gõ sai lệnh; lệnh đúng là `/ghi` kèm nội dung.

### Tổng kết tuần theo từng nhân sự

Cài đặt → Thông báo Telegram → bật *Tổng kết tuần theo nhân sự*. Gửi cùng giờ với tóm tắt tuần, vào **nhánh Giao việc**, mỗi người **một tin riêng** để bạn chuyển tiếp thẳng cho họ mà không phải cắt dán, và không lộ số liệu người này sang người kia:

```
🧑‍🔧 Linh · tuần 17/08/2026

📥 1 việc mới giao trong tuần
✓ 1 việc đã xong
📋 1 việc còn đang mở

─────────────

🔴 Đang trễ (1)
   • Sửa kệ hàng — trễ 10 ngày

─────────────

💰 Tiền công ngoài luồng chưa trả: 500.000₫ (1 việc)
```

Ai không giữ thẻ việc nào thì không có tin. Nút **Gửi tổng kết nhân sự ngay** ở màn Cài đặt gửi thử bất cứ lúc nào.

### Dời lời nhắc lại

Bốn mức: **4 giờ · 12 giờ · 1 ngày · 3 ngày**. Bấm được ở hai chỗ, cùng một kết quả:

- **Trên Telegram** — hàng nút ⏰ ngay dưới tin nhắc.
- **Trên web** — nút ⏰ ở cuối mỗi dòng việc, và ở hàng nút dưới mỗi thẻ giao việc.

Dời xong, chip 🔔 giờ hẹn đổi thành chip vàng **⏰ 18:03** (hoặc *⏰ 09:00 mai*) để bạn nhìn danh sách là biết ngay việc nào đang được đẩy lùi. Mở lại hộp dời có thêm nút **Bỏ dời** để trả về giờ hẹn cũ.

**Chỉ dời lời nhắc, không dời hạn chót.** Việc trễ vẫn hiện là trễ, vẫn nằm trong bảng công việc và vẫn bị báo trễ leo thang. Nếu dời được cả hạn thì bấm vài lần là mất dấu việc đang chậm — đúng thứ cần tránh nhất.

Vài điểm nhỏ đáng biết:

- Đã dời trong ngày thì lời nhắc theo giờ hẹn thường **im hẳn** hôm đó, không nhắc chồng.
- Dời tiếp lần nữa vẫn được nhắc tiếp — mỗi mốc dời là một lời nhắc riêng.
- Dời được cả việc **không có hạn**: lúc đó nó thành "nhắc tôi sau 4 tiếng".
- Bấm ✅ Xong thì mốc dời tự xoá.
- Web và Telegram dùng chung một trường dữ liệu, nên bấm bên nào bên kia cũng thấy sau lượt đồng bộ kế tiếp.

### Tóm tắt cuối tuần

Cài đặt → Thông báo Telegram → ô *Giờ gửi tóm tắt tuần*. Gửi một lần vào **Chủ nhật**, gọn hơn màn "Ôn lại tuần" trong app nhưng cùng ý: việc đã xong trong 7 ngày qua, thẻ giao việc đã xong, số người đã hỏi thăm, việc còn trễ chưa xử lý, và những người lâu chưa liên lạc so với mức độ thân sơ của họ (S/S2 thúc sớm hơn C nhiều).

```
📅 Tuần này · 16/08/2026

✓ 4 việc xong · 📇 2 thẻ giao xong · ☎️ 3 người đã hỏi thăm

⚠️ Đang trễ — dời hay bỏ? (1)
   • Nộp báo cáo quý

🙈 Lâu rồi chưa hỏi thăm
   • Cô Tư — trễ 12 ngày
```

Nút **Gửi tóm tắt tuần ngay** gửi thử bất cứ lúc nào, không phải chờ tới Chủ nhật.

### Bản tóm tắt hằng ngày

Gửi một lần mỗi ngày vào giờ bạn chọn, gồm: việc đến hạn (kèm số việc đã trễ), sinh nhật hôm nay và trong 7 ngày tới (cả người quen lẫn nhân viên), dịp và giỗ sắp tới theo số ngày báo trước của từng dịp, việc đã giao đang trễ, và tiền công ngoài luồng còn nợ.

Máy chủ tự tính từ dữ liệu đã đồng bộ nên vẫn đúng dù bạn cả tuần không mở app. Riêng ngày âm lịch được app tính sẵn mỗi lần bạn mở lên rồi gửi kèm — nên nếu bạn không mở app suốt nhiều tháng, ngày giỗ có thể lệch một năm cho tới lần mở kế tiếp.

> **Mã bot để ở đâu:** trong cơ sở dữ liệu trên máy chủ, không nằm trong `config.php`, không đồng bộ xuống máy nào, và API không bao giờ trả nó về trình duyệt — màn hình Cài đặt chỉ biết "đã có mã" hay chưa. Ai cầm được mã bot là nhắn được vào group của bạn, nên nó không đi lung tung.

---

## Đăng nhập & đồng bộ qua máy chủ của bạn

Đây là cách nên dùng khi app đã nằm trên Hostinger: dữ liệu ở máy chủ, muốn xem phải nhập mật khẩu, điện thoại và máy tính thấy cùng một thứ.

### Cài lần đầu (làm một lần)

**1. Tạo mã mật khẩu ở máy bạn**

```bash
node tools/hash-password.js
```

Gõ mật khẩu bạn muốn. Nó in ra một dòng `define('LH_PASSWORD', 'pbkdf2_sha256$…');`. Mật khẩu thật không đi đâu cả — dòng này chỉ là mã băm, từ đó không suy ngược lại được.

**2. Đưa code lên**

```bash
git push
```

Hostinger tự kéo về, trong đó đã có sẵn thư mục `api/`.

**3. Tạo file cấu hình trên máy chủ**

Trong File Manager của Hostinger, vào `public_html/api/`:

- Đổi tên `config.example.php` → `config.php`
- Mở nó ra, thay dòng `define('LH_PASSWORD', 'DAN_MA_VAO_DAY');` bằng dòng bạn vừa tạo ở bước 1
- Lưu lại

Xong. Mở app trên trình duyệt, nó sẽ hỏi mật khẩu.

### Kiểm tra nhanh sau khi upload

1. Mở app → phải thấy màn hình nhập mật khẩu, không thấy dữ liệu.
2. Gõ sai một lần → phải báo *"Sai mật khẩu. Còn 7 lần thử."* Nếu báo *"Chưa có api/config.php"* thì bước 3 chưa xong.
3. Đăng nhập → vào được → Cài đặt → **Xem máy chủ**, phải hiện số bản ghi.
4. Mở trên điện thoại, đăng nhập → dữ liệu phải hiện đầy đủ.

### Cách nó chạy

- Dữ liệu vẫn nằm trong máy để app mở nhanh và chạy được khi mất mạng, nhưng bản gốc ở máy chủ.
- Mỗi bản ghi có mốc thời gian riêng, ai sửa sau thì bản đó thắng. Xoá là đánh dấu xoá nên xoá ở máy này sẽ lan sang máy kia.
- Đẩy lên sau mỗi thay đổi 2,5 giây; kéo về mỗi 45 giây, mỗi lần mở lại app và mỗi lần có mạng trở lại.
- Phiên đăng nhập sống 60 ngày. Mất mạng thì vẫn mở được app trong khoảng đó; **hết hạn mà vẫn mất mạng thì phải nhập lại mật khẩu** — không có đường vòng.

### Đổi mật khẩu

Chạy lại `node tools/hash-password.js`, rồi sửa `api/config.php` **thẳng trên máy chủ** bằng File Manager (file này không nằm trong git nên push không đổi được nó). Các máy đang đăng nhập vẫn giữ phiên; muốn đá hết ra thì bấm **Đăng xuất mọi thiết bị** trong Cài đặt.

### Đăng xuất

Cài đặt → Đăng xuất, chọn một trong hai:

- **Chỉ đăng xuất** — giữ bản sao trên máy, lần sau mở rất nhanh.
- **Đăng xuất và xoá dữ liệu trên máy này** — dùng khi mượn máy người khác. Dữ liệu trên máy chủ không mất, đăng nhập lại là tải về đủ.

### Sao lưu dữ liệu trên máy chủ

Tải file `.sqlite` về bằng File Manager (chỗ để nó xem mục [Chỗ để file dữ liệu](#chỗ-để-file-dữ-liệu--đọc-kỹ-phần-này)). Hoặc dùng Cài đặt → **Xuất sao lưu** trong app cho nhanh.

> **Nói thẳng về mức bảo vệ:** mật khẩu do máy chủ kiểm, lưu dạng PBKDF2-SHA256 210.000 vòng, sai quá 8 lần thì khoá IP 15 phút. Phiên giữ trong cookie HttpOnly nên JavaScript không đọc được. Như vậy là đủ chắc cho một app cá nhân. Nhưng nó **không** phải hệ thống nhiều người dùng có phân quyền, và không có xác thực hai lớp. Bắt buộc bật SSL — không có https thì mật khẩu đi qua mạng ở dạng trần.

**Nếu hosting không bật `pdo_sqlite`:** app sẽ báo thẳng ra ở màn đăng nhập. Lúc đó vào hPanel → PHP Configuration bật extension đó lên, hoặc nhắn tôi để chuyển `api/index.php` sang MySQL (đổi vài dòng kết nối, phần còn lại giữ nguyên).

---

## Đồng bộ qua Supabase (cách cũ, không bắt buộc)

Cách này có từ trước khi có máy chủ riêng. Nếu bạn đã cài api/ theo mục trên thì bỏ qua hẳn phần này — app tự ưu tiên máy chủ của bạn.

1. Tạo project trên [supabase.com](https://supabase.com) (bản miễn phí là đủ).
2. Vào **SQL Editor** → dán toàn bộ `supabase-schema.sql` → **Run**.
3. Vào **Project Settings → API**, chép **Project URL** và **anon public key**.
4. Trong app: Cài đặt → Đồng bộ → dán URL + key, bấm **Tạo tên ngẫu nhiên** cho ô không gian → **Lưu & kết nối**.
5. Máy thứ hai: nhập đúng ba giá trị đó là dữ liệu chảy về.

Cách trộn: mỗi bản ghi có mốc thời gian riêng, ai sửa sau thì bản đó thắng. Xoá là đánh dấu xoá chứ không mất hẳn, nên xoá ở máy này sẽ lan sang máy kia. Đẩy lên sau mỗi thay đổi 2,5 giây, kéo về mỗi 45 giây và mỗi lần mở lại app.

### Cho nhân viên tự cập nhật tiến độ
Cài đặt → Nhân sự → bấm 🔗 cạnh tên → gửi link cho họ. Mở link là máy họ tự cấu hình, chỉ thấy **bảng việc của riêng họ**, không thấy phần quan hệ hay việc cá nhân.

> **Về bảo mật, nói thẳng:** mô hình ở đây là “ai biết tên không gian + anon key thì đọc ghi được không gian đó”, giống một link chia sẻ bí mật. Không có đăng nhập riêng cho từng người. Vì vậy hãy dùng nút tạo tên ngẫu nhiên (schema đã chặn tên dưới 8 ký tự) và chỉ gửi link cho người bạn tin. Nếu sau này cần chặt chẽ hơn thì phải thêm Supabase Auth và viết lại policy theo `auth.uid()`.

---

## Sao lưu

Cài đặt → **Xuất sao lưu (.json)**. Nên làm mỗi tháng một lần.
Xoá dữ liệu trình duyệt hoặc gỡ app = mất dữ liệu nếu chưa bật đồng bộ.
