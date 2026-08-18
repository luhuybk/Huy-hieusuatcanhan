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

Có, và đây là chỗ trước đây bị hỏng. Ba lớp cùng lo việc này:

- `.htaccess` bắt `html`/`css`/`js` **luôn hỏi lại máy chủ**. Nội dung không đổi thì máy chủ trả 304 rỗng, gần như không tốn gì.
- Service worker dùng bản đã lưu để mở nhanh, đồng thời tải lại ngầm để so. Tệp nhỏ nên nó so cả nội dung chứ không chỉ dựa vào ETag.
- Thấy khác là hiện thanh **"Đã có bản mới của app · Tải lại"** ở cuối màn hình. Bấm là xoá bộ nhớ đệm rồi nạp lại sạch. Không tự tải lại — đang gõ dở mà trang nhảy thì rất khó chịu.

Nếu vì lý do gì đó vẫn kẹt ở bản cũ: mở app, Cài đặt → Đăng xuất, rồi xoá dữ liệu duyệt web của riêng trang đó. Cách này gỡ luôn service worker cũ.

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
Việc đến hạn, việc giao đang trễ, sinh nhật sắp tới, ân tình chưa trả — và mục **“Hôm nay nên hỏi thăm ai”** gợi ý ba người đang bị bỏ quên lâu nhất so với chu kỳ của nhóm họ.

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
- **Việc cần làm** — tự chia Quá hạn / Hôm nay / Sắp tới / Không hạn.
- **Việc lặp lại** — hàng ngày, cách ngày, hàng tuần, 2 tuần, hàng tháng, mỗi quý, nửa năm, hàng năm. Tick xong là hạn tự nhảy sang kỳ kế tiếp, kèm **chuỗi 🔥** đếm số kỳ làm đúng hẹn liên tiếp (bỏ lỡ thì chuỗi về 0). Nếu bỏ lỡ nhiều kỳ, app nhảy thẳng tới mốc sắp tới chứ không dồn việc.

### Ý tưởng

Màn riêng ở thanh bên — **💡 Ý tưởng** — chứ không nằm sau một tab của Công việc. Ý tưởng là chỗ nghĩ dài hạn, phải mở được bằng một cú bấm.

Nội dung và hướng triển khai tách riêng, có nút đưa thẳng lên bảng giao việc. Ba nhóm:

| Nhóm | Gồm |
|---|---|
| **Đang nuôi** | mọi thứ chưa xong và chưa gác — mở màn là thấy nhóm này |
| **Đang triển khai** | riêng những ý tưởng đã bắt tay làm |
| **Kho** | đã xong và tạm gác, cất đi cho danh sách chính gọn |

Con số trên thanh bên đếm số ý tưởng **đang triển khai** — tức là những thứ bạn đã cam kết làm, không phải mọi thứ từng nghĩ ra.

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

**Bốn nhánh riêng cho bốn loại tin.** Trộn hết vào một nhánh thì một bản báo cáo dài đẩy trôi mất mấy lời nhắc ngắn. Bốn ô trong Cài đặt chia như sau:

| Ô | Tin nào đi vào đây |
|---|---|
| **Việc cần làm** | nhắc riêng từng việc của mình, báo trễ leo thang của việc mình |
| **Giao việc** | nhắc riêng từng thẻ giao việc, báo trễ leo thang của thẻ |
| **Nhắc lặp lại** | gym, uống thuốc, chốt sổ… — trừ lời nhắc nào tự đặt nhánh riêng cho nó |
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

Cài đặt → **Nhắc lặp lại** → **+ Thêm**. Mỗi lời nhắc gồm: nội dung, giờ, những thứ trong tuần, nhánh riêng (nếu muốn tin này vào nhánh khác), và ghi chú thêm.

Đúng ví dụ bạn nói: *Tập gym · T2·T3·T5·T6·T7 · 18:30* — app hiển thị gọn thành `T2 · T3 · T5 · T6 · T7 lúc 18:30`. Chọn cả 7 thứ thì nó rút thành "hằng ngày", chọn T2→T6 thì thành "thứ 2 → thứ 6".

Nút ➤ bên phải mỗi dòng gửi thử ngay lập tức. Ô vuông bên trái bật/tắt nhanh mà không cần mở ra sửa.

**Nút "✅ Xong hôm nay".** Sau khi bật nút bấm (xem phần dưới), mỗi tin nhắc lặp lại kèm một nút — tập xong bấm một cái là hệ thống ghi lại, không cần mở app:

```
🔔 Tập gym
18:30

mang găng tay

[ ✅ Xong hôm nay ]
```

Trong app, mỗi dòng nhắc có nút ✓ tương ứng, một chuỗi 🔥 đếm số kỳ liên tiếp, và **dải bảy ngày gần nhất** để thấy ngay mình đang đều hay đang đứt:

```
Tập gym
hằng ngày · hôm nay 18:30 · 🔥 3
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
